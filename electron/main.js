const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, systemPreferences } = require("electron")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const net = require("net")
const dgram = require("dgram")
const os = require("os")
const { spawn } = require("child_process")
const isDev = process.env.NODE_ENV === "development"
const isDebug = isDev || process.env.CREDSTORE_DEBUG === "1"
const DESKTOP_SYNC_UDP_PORT = 47844
const DESKTOP_SYNC_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
const DESKTOP_SYNC_DISCOVERY_TIMEOUT_MS = 2500
let desktopSyncReceiver = null

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
  if (!isDebug) {
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
      submenu: isDebug
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
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"))
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show()

    if (isDebug) {
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

ipcMain.handle("credstore:local-sync:is-available", async () => {
  return {
    available: true,
    code: "AVAILABLE",
    message: "Desktop local Wi-Fi sync is available on this computer.",
  }
})

ipcMain.handle("credstore:local-sync:discover-receivers", async (_event, options) => {
  const otp = sanitizeOtp(options?.otp)
  if (!otp) throw new Error("Pairing OTP is required")
  return discoverDesktopSyncReceivers(otp)
})

ipcMain.handle("credstore:local-sync:start-receiver", async (_event, options) => {
  const otp = sanitizeOtp(options?.otp)
  const checksum = sanitizeBridgeText(options?.checksum, 32)
  if (!otp) throw new Error("Pairing OTP is required")
  return startDesktopSyncReceiver({ otp, checksum })
})

ipcMain.handle("credstore:local-sync:send-payload", async (_event, options) => {
  const host = sanitizeHost(options?.host)
  const port = Number(options?.port)
  const otp = sanitizeOtp(options?.otp)
  const checksum = sanitizeBridgeText(options?.checksum, 32)
  const payload = sanitizeBridgeText(options?.payload, DESKTOP_SYNC_MAX_PAYLOAD_BYTES)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !otp || !payload) {
    throw new Error("host, port, otp, and payload are required")
  }
  return sendDesktopSyncPayload({ host, port, otp, checksum, payload })
})

ipcMain.handle("credstore:local-sync:stop-receiver", async () => {
  stopDesktopSyncReceiver(new Error("Desktop receiver stopped"))
  return {}
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

function sanitizeOtp(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12)
}

function sanitizeHost(value) {
  const host = String(value || "").trim()
  if (!/^[A-Za-z0-9.:%-]+$/.test(host)) return ""
  return host.slice(0, 255)
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
    return {
      available: false,
      code: "NATIVE_PLUGIN_REQUIRED",
      message: "Windows Hello unlock needs a tested native key-release bridge. It is disabled in this build.",
    }
  }

  if (process.platform === "linux") {
    return {
      available: false,
      code: "NATIVE_PLUGIN_REQUIRED",
      message: "Linux fingerprint unlock needs a tested native key-release bridge. It is disabled in this build.",
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
    throw new Error("Windows Hello unlock is disabled until the native bridge is implemented")
  }

  if (process.platform === "linux") {
    throw new Error("Linux fingerprint unlock is disabled until the native bridge is implemented")
  }

  throw new Error("Desktop biometric unlock is unsupported here")
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`])
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

function getDesktopSyncDeviceName() {
  return `${os.hostname() || "CredStore Desktop"}`
}

function getDesktopSyncDeviceId() {
  return crypto.createHash("sha256").update(`${os.hostname()}-${os.userInfo().username}`).digest("hex").slice(0, 12)
}

function createDesktopSyncAnnouncement(receiver) {
  return JSON.stringify({
    type: "credstore-sync-receiver",
    version: 1,
    otp: receiver.otp,
    host: getPrimaryLanAddress(),
    port: receiver.port,
    name: getDesktopSyncDeviceName(),
    id: getDesktopSyncDeviceId(),
  })
}

function getPrimaryLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address
    }
  }
  return "127.0.0.1"
}

function getBroadcastTargets() {
  const targets = new Set(["255.255.255.255"])
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal || !address.netmask) continue
      const ip = ipv4ToInt(address.address)
      const mask = ipv4ToInt(address.netmask)
      if (ip === null || mask === null) continue
      targets.add(intToIpv4((ip & mask) | (~mask >>> 0)))
    }
  }
  return Array.from(targets)
}

function ipv4ToInt(value) {
  const parts = String(value).split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0)
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".")
}

function startDesktopSyncReceiver({ otp, checksum }) {
  stopDesktopSyncReceiver()

  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      const chunks = []
      let size = 0

      socket.on("data", (chunk) => {
        size += chunk.length
        if (size > DESKTOP_SYNC_MAX_PAYLOAD_BYTES) {
          socket.destroy(new Error("Payload is too large"))
          return
        }
        chunks.push(chunk)
      })

      socket.on("end", () => {
        try {
          const packet = JSON.parse(Buffer.concat(chunks).toString("utf8"))
          if (packet.type !== "credstore-sync-payload" || packet.version !== 1) throw new Error("Invalid payload packet")
          if (sanitizeOtp(packet.otp) !== otp) throw new Error("Pairing OTP mismatch")
          const payload = sanitizeBridgeText(packet.payload, DESKTOP_SYNC_MAX_PAYLOAD_BYTES)
          if (!payload) throw new Error("Payload is empty")
          if (checksum && packet.checksum !== checksum) throw new Error("Pairing checksum mismatch")
          if (packet.checksum && packet.checksum !== checksumTextNode(payload)) throw new Error("Payload checksum mismatch")

          const receiver = desktopSyncReceiver
          stopDesktopSyncReceiver()
          resolve({ payload, deviceName: packet.name || "Desktop client", deviceId: packet.id || "desktop" })
          receiver?.server?.close()
        } catch (error) {
          reject(error)
          stopDesktopSyncReceiver(error)
        }
      })
    })

    server.on("error", (error) => {
      stopDesktopSyncReceiver(error)
      reject(error)
    })

    server.listen(0, "0.0.0.0", () => {
      const address = server.address()
      const receiver = {
        server,
        udp: null,
        interval: null,
        otp,
        checksum,
        port: typeof address === "object" && address ? address.port : 0,
      }
      desktopSyncReceiver = receiver
      startDesktopSyncAdvertisement(receiver, reject)
    })
  })
}

function startDesktopSyncAdvertisement(receiver, reject) {
  const udp = dgram.createSocket("udp4")
  receiver.udp = udp

  udp.on("error", (error) => {
    stopDesktopSyncReceiver(error)
    reject(error)
  })

  udp.on("message", (message, remote) => {
    try {
      const request = JSON.parse(message.toString("utf8"))
      if (request.type !== "credstore-sync-discover" || sanitizeOtp(request.otp) !== receiver.otp) return
      const announcement = Buffer.from(createDesktopSyncAnnouncement(receiver))
      udp.send(announcement, remote.port, remote.address)
    } catch {
      // Ignore unrelated LAN traffic.
    }
  })

  udp.bind(DESKTOP_SYNC_UDP_PORT, () => {
    udp.setBroadcast(true)
    const announce = () => {
      const message = Buffer.from(createDesktopSyncAnnouncement(receiver))
      for (const target of getBroadcastTargets()) {
        udp.send(message, DESKTOP_SYNC_UDP_PORT, target)
      }
    }
    announce()
    receiver.interval = setInterval(announce, 1000)
  })
}

function stopDesktopSyncReceiver(error) {
  const receiver = desktopSyncReceiver
  desktopSyncReceiver = null
  if (!receiver) return
  if (receiver.interval) clearInterval(receiver.interval)
  try {
    receiver.udp?.close()
  } catch {}
  try {
    receiver.server?.close()
  } catch {}
  if (error) console.error(`CredStore local sync receiver stopped: ${error.message}`)
}

function discoverDesktopSyncReceivers(otp) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4")
    const found = new Map()
    const request = Buffer.from(JSON.stringify({ type: "credstore-sync-discover", version: 1, otp }))
    const timer = setTimeout(() => {
      socket.close()
      resolve({ devices: Array.from(found.values()) })
    }, DESKTOP_SYNC_DISCOVERY_TIMEOUT_MS)

    socket.on("error", (error) => {
      clearTimeout(timer)
      socket.close()
      reject(error)
    })

    socket.on("message", (message, remote) => {
      try {
        const response = JSON.parse(message.toString("utf8"))
        if (response.type !== "credstore-sync-receiver" || sanitizeOtp(response.otp) !== otp) return
        const host = sanitizeHost(response.host) || remote.address
        const port = Number(response.port)
        if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return
        const id = `${host}:${port}`
        found.set(id, {
          id,
          name: sanitizeBridgeText(response.name, 80) || "CredStore Desktop",
          host,
          port,
          deviceId: sanitizeBridgeText(response.id, 80) || id,
        })
      } catch {
        // Ignore unrelated LAN traffic.
      }
    })

    socket.bind(() => {
      socket.setBroadcast(true)
      for (const target of getBroadcastTargets()) {
        socket.send(request, DESKTOP_SYNC_UDP_PORT, target)
      }
    })
  })
}

function sendDesktopSyncPayload({ host, port, otp, checksum, payload }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      const packet = JSON.stringify({
        type: "credstore-sync-payload",
        version: 1,
        otp,
        checksum: checksum || checksumTextNode(payload),
        payload,
        name: getDesktopSyncDeviceName(),
        id: getDesktopSyncDeviceId(),
      })
      socket.end(packet)
    })

    socket.on("timeout", () => socket.destroy(new Error("Connection timed out")))
    socket.on("error", reject)
    socket.on("close", (hadError) => {
      if (!hadError) resolve({})
    })
  })
}

function checksumTextNode(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
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
  if (isDev || isDebug || process.env.CREDSTORE_SKIP_RASP_CHECKS === "1") return

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
  if (!isDebug) return false

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
  if (isDebug) {
    // In development, ignore certificate errors
    event.preventDefault()
    callback(true)
  } else {
    // In production, use default behavior
    callback(false)
  }
})
