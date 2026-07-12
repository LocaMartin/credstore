const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, systemPreferences } = require("electron")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { spawn } = require("child_process")
const isDev = process.env.NODE_ENV === "development"

app.commandLine.appendSwitch("enable-features", "WebBluetooth")

// Enable live reload for Electron in development
if (isDev) {
  require("electron-reload")(__dirname, {
    electron: path.join(__dirname, "..", "node_modules", ".bin", "electron"),
    hardResetMethod: "exit",
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      sandbox: true,
    },
    icon: getIconPath(),
    titleBarStyle: "hidden",
    show: false,
    autoHideMenuBar: true,
    title: "CredStore - Secure Credential Manager",
  })

  mainWindow.setContentProtection(true)
  if (!isDev) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  mainWindow.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault()
    const receiver =
      devices.find((device) => /credstore/i.test(device.deviceName || "")) ||
      devices.find((device) => Boolean(device.deviceName)) ||
      devices[0]
    callback(receiver?.deviceId || "")
  })

  // Create application menu
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Lock Vault",
          accelerator: "CmdOrCtrl+L",
          click: () => {
            mainWindow.webContents.executeJavaScript("window.location.reload()")
          },
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit()
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectall" },
      ],
    },
    {
      label: "View",
      submenu: isDev
        ? [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
          ]
        : [
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
          ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000")
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"))
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show()

    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.on("closed", () => {
    app.quit()
  })

  // Strictly local: block all attempts to open new external windows.
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" }
  })
}

ipcMain.handle("credstore:window-control", (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return

  if (action === "minimize") {
    window.minimize()
    return
  }

  if (action === "maximize") {
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return
  }

  if (action === "close") {
    window.close()
  }
})

ipcMain.handle("credstore:biometric:is-available", async () => {
  return getDesktopBiometricAvailability()
})

ipcMain.handle("credstore:biometric:create-secret", async (_event, options) => {
  const slotId = sanitizeBridgeText(options?.slotId, 120)
  const secret = sanitizeBridgeText(options?.secret, 12000)
  if (!slotId || !secret) throw new Error("slotId and secret are required")

  await verifyDesktopBiometric("Save CredStore biometric master key")
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Electron safeStorage is not available")

  return {
    encrypted: safeStorage.encryptString(secret).toString("base64"),
    iv: process.platform,
  }
})

ipcMain.handle("credstore:biometric:get-secret", async (_event, options) => {
  const encrypted = sanitizeBridgeText(options?.encrypted, 20000)
  if (!encrypted) throw new Error("encrypted is required")

  await verifyDesktopBiometric("Unlock CredStore")
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Electron safeStorage is not available")

  return {
    secret: safeStorage.decryptString(Buffer.from(encrypted, "base64")),
  }
})

ipcMain.handle("credstore:bluetooth:is-available", async () => {
  if (process.platform === "linux") {
    const hasBluetoothctl = await commandExists("bluetoothctl")
    return {
      available: hasBluetoothctl,
      code: hasBluetoothctl ? "AVAILABLE" : "UNAVAILABLE",
      message: hasBluetoothctl
        ? "Linux Bluetooth control is available. Native file/data transfer still depends on BlueZ services."
        : "Install BlueZ bluetoothctl to use Bluetooth on Linux.",
    }
  }

  if (process.platform === "darwin" || process.platform === "win32") {
    return {
      available: false,
      code: "NATIVE_PLUGIN_REQUIRED",
      message: "Desktop Bluetooth data transfer requires the native platform bridge for this OS.",
    }
  }

  return { available: false, code: "UNSUPPORTED", message: "Bluetooth sync is unsupported on this platform." }
})

function getIconPath() {
  let iconPath
  if (process.platform === "win32") {
    iconPath = path.join(__dirname, "assets", "icon.ico")
  } else if (process.platform === "darwin") {
    iconPath = path.join(__dirname, "assets", "icon.icns")
  } else {
    iconPath = path.join(__dirname, "assets", "icon.png")
  }

  return fs.existsSync(iconPath) ? iconPath : undefined
}

function sanitizeBridgeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, maxLength)
}

async function getDesktopBiometricAvailability() {
  if (process.platform === "darwin") {
    const available = systemPreferences.canPromptTouchID()
    return {
      available,
      code: available ? "AVAILABLE" : "NO_HARDWARE",
      message: available ? "Touch ID is available." : "Touch ID is not available or not enrolled on this Mac.",
    }
  }

  if (process.platform === "win32") {
    const result = await runWindowsHelloCheck()
    return {
      available: result,
      code: result ? "AVAILABLE" : "UNAVAILABLE",
      message: result ? "Windows Hello is available." : "Windows Hello is unavailable or not configured.",
    }
  }

  if (process.platform === "linux") {
    const result = await commandExists("fprintd-verify")
    return {
      available: result,
      code: result ? "AVAILABLE" : "UNAVAILABLE",
      message: result
        ? "Linux fingerprint verification is available through fprintd."
        : "Install and enroll fprintd fingerprints to use biometric unlock on Linux.",
    }
  }

  return { available: false, code: "UNSUPPORTED", message: "Desktop biometric unlock is unsupported here." }
}

async function verifyDesktopBiometric(reason) {
  if (process.platform === "darwin") {
    if (!systemPreferences.canPromptTouchID()) throw new Error("Touch ID is unavailable")
    await systemPreferences.promptTouchID(reason)
    return
  }

  if (process.platform === "win32") {
    const verified = await runWindowsHelloPrompt(reason)
    if (!verified) throw new Error("Windows Hello verification failed")
    return
  }

  if (process.platform === "linux") {
    const verified = await runLinuxFingerprintPrompt()
    if (!verified) throw new Error("Linux fingerprint verification failed")
    return
  }

  throw new Error("Desktop biometric unlock is unsupported here")
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
    })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.on("error", () => resolve(""))
    child.on("close", () => resolve(output.trim()))
  })
}

async function runWindowsHelloCheck() {
  const script = `
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null
    $op = [Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()
    $result = [System.WindowsRuntimeSystemExtensions]::AsTask($op).GetAwaiter().GetResult()
    [Console]::Write($result.ToString())
  `
  const output = await runPowerShell(script)
  return output === "Available"
}

async function runWindowsHelloPrompt(reason) {
  const escapedReason = String(reason).replace(/'/g, "''")
  const script = `
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null
    $op = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${escapedReason}')
    $result = [System.WindowsRuntimeSystemExtensions]::AsTask($op).GetAwaiter().GetResult()
    [Console]::Write($result.ToString())
  `
  const output = await runPowerShell(script)
  return output === "Verified"
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`])
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

function runLinuxFingerprintPrompt() {
  return new Promise((resolve) => {
    const child = spawn("fprintd-verify", [], { stdio: "ignore" })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

app.whenReady().then(() => {
  verifyRuntimeEnvironment()
  verifyApplicationIntegrity()
  installOfflineGuards()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

function verifyApplicationIntegrity() {
  if (isDev || !app.isPackaged || process.env.CREDSTORE_SKIP_INTEGRITY_CHECK === "1") return

  const manifestPath = path.join(__dirname, "integrity-manifest.json")
  if (!fs.existsSync(manifestPath)) {
    failIntegrityCheck("integrity manifest is missing")
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  } catch {
    failIntegrityCheck("integrity manifest is unreadable")
  }

  if (manifest.algorithm !== "sha256" || !manifest.files || typeof manifest.files !== "object") {
    failIntegrityCheck("integrity manifest has an invalid format")
  }

  const appRoot = path.resolve(__dirname, "..")
  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    const absolutePath = path.resolve(appRoot, relativePath)
    if (!absolutePath.startsWith(appRoot)) failIntegrityCheck(`invalid manifest path: ${relativePath}`)
    if (!fs.existsSync(absolutePath)) failIntegrityCheck(`protected file is missing: ${relativePath}`)

    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex")
    if (actualHash !== expectedHash) failIntegrityCheck(`protected file was modified: ${relativePath}`)
  }
}

function failIntegrityCheck(reason) {
  console.error(`CredStore integrity check failed: ${reason}`)
  app.exit(1)
}

function verifyRuntimeEnvironment() {
  if (isDev || process.env.CREDSTORE_SKIP_RASP_CHECKS === "1") return

  const debugFlags = [...process.execArgv, ...process.argv].join(" ")
  if (/--inspect|--inspect-brk|--remote-debugging-port|--remote-debugging-pipe/i.test(debugFlags)) {
    failIntegrityCheck("debugger launch flags are not allowed")
  }

  if (process.platform === "linux") {
    try {
      const status = fs.readFileSync("/proc/self/status", "utf8")
      const tracerPid = Number(status.match(/^TracerPid:\s*(\d+)/m)?.[1] || "0")
      if (tracerPid > 0) failIntegrityCheck("debugger attachment detected")
    } catch {
      // Some hardened Linux environments hide /proc; continue with the other guards.
    }
  }
}

function installOfflineGuards() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(_permission === "media")
  })

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedLocalUrl(details.url)) {
      callback({})
      return
    }

    callback({ cancel: true })
  })
}

function isAllowedLocalUrl(url) {
  if (url.startsWith("file://")) {
    try {
      const appRoot = path.resolve(__dirname, "../out")
      const requestedPath = decodeURIComponent(new URL(url).pathname)
      return path.resolve(requestedPath).startsWith(appRoot)
    } catch {
      return false
    }
  }
  if (!isDev) return false

  try {
    const parsedUrl = new URL(url)
    return parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1"
  } catch {
    return false
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

// Security: Prevent new window creation
app.on("web-contents-created", (event, contents) => {
  contents.on("new-window", (event, navigationUrl) => {
    event.preventDefault()
  })

  contents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    if (!isAllowedLocalUrl(navigationUrl) || (isDev && parsedUrl.origin !== "http://localhost:3000")) {
      event.preventDefault()
    }
  })
})

// Handle certificate errors
app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault()
    callback(true)
  } else {
    // In production, use default behavior
    callback(false)
  }
})
