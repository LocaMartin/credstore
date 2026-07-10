const { app, BrowserWindow, Menu, session } = require("electron")
const path = require("path")
const fs = require("fs")
const isDev = process.env.NODE_ENV === "development"

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      sandbox: true,
    },
    icon: getIconPath(),
    titleBarStyle: "default",
    show: false,
    autoHideMenuBar: true, // Hide menu bar by default
    title: "CredStore - Secure Credential Manager",
  })

  mainWindow.setContentProtection(true)

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
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
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

app.whenReady().then(() => {
  installOfflineGuards()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

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
