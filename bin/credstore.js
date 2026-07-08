#!/usr/bin/env node

const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")
const pkg = require("../package.json")

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`CredStore ${pkg.version}

Usage:
  credstore            Launch the CredStore desktop app
  credstore --no-sandbox
                       Launch in restricted Linux environments
  credstore --install-desktop
                       Add CredStore to the Linux app launcher
  credstore --uninstall-desktop
                       Remove CredStore from the Linux app launcher
  credstore --version  Print the installed version
  credstore --help     Show this help
`)
  process.exit(0)
}

const desktopFilePath = path.join(os.homedir(), ".local", "share", "applications", "credstore.desktop")

function refreshDesktopDatabase() {
  const applicationsDir = path.dirname(desktopFilePath)
  const updater = spawn("update-desktop-database", [applicationsDir], {
    stdio: "ignore",
  })

  updater.on("error", () => {})
}

if (args.includes("--install-desktop")) {
  if (process.platform !== "linux") {
    console.error("Desktop launcher installation is only supported on Linux.")
    process.exit(1)
  }

  const applicationsDir = path.dirname(desktopFilePath)
  fs.mkdirSync(applicationsDir, { recursive: true })

  const command = process.argv[1] || "credstore"
  const iconPath = path.resolve(__dirname, "..", ".res", "logo.svg")
  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=CredStore",
    "Comment=Secure Offline Credential Manager",
    `Exec=${command}`,
    `Icon=${iconPath}`,
    "Terminal=false",
    "Categories=Utility;Security;",
    "Keywords=password;credential;security;vault;",
    "",
  ].join("\n")

  fs.writeFileSync(desktopFilePath, desktopEntry, { mode: 0o644 })
  refreshDesktopDatabase()
  console.log(`Installed desktop launcher: ${desktopFilePath}`)
  process.exit(0)
}

if (args.includes("--uninstall-desktop")) {
  if (fs.existsSync(desktopFilePath)) {
    fs.unlinkSync(desktopFilePath)
    refreshDesktopDatabase()
  }

  console.log(`Removed desktop launcher: ${desktopFilePath}`)
  process.exit(0)
}

const electron = require("electron")
const appRoot = path.resolve(__dirname, "..")
const electronArgs = []
const appArgs = []

for (const arg of args) {
  if (arg === "--no-sandbox") {
    electronArgs.push(arg)
  } else {
    appArgs.push(arg)
  }
}

if (process.env.CREDSTORE_NO_SANDBOX === "1" && !electronArgs.includes("--no-sandbox")) {
  electronArgs.push("--no-sandbox")
}

const child = spawn(electron, [...electronArgs, appRoot, ...appArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
})

child.on("error", (error) => {
  console.error(`Failed to launch CredStore: ${error.message}`)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code || 0)
})
