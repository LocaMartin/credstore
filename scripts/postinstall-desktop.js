#!/usr/bin/env node

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawn } = require("child_process")

if (process.platform !== "linux" || process.env.CREDSTORE_SKIP_DESKTOP_INSTALL === "1") {
  process.exit(0)
}

try {
  const applicationsDir = path.join(os.homedir(), ".local", "share", "applications")
  const desktopFilePath = path.join(applicationsDir, "credstore.desktop")
  const packageRoot = path.resolve(__dirname, "..")
  const iconPath = path.join(packageRoot, ".res", "logo.svg")
  const icon = fs.existsSync(iconPath) ? iconPath : "credstore"
  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=CredStore",
    "Comment=Secure Offline Credential Manager",
    "Exec=credstore",
    `Icon=${icon}`,
    "Terminal=false",
    "Categories=Utility;Security;",
    "Keywords=password;credential;security;vault;",
    "",
  ].join("\n")

  fs.mkdirSync(applicationsDir, { recursive: true })
  fs.writeFileSync(desktopFilePath, desktopEntry, { mode: 0o644 })

  const updater = spawn("update-desktop-database", [applicationsDir], { stdio: "ignore" })
  updater.on("error", () => {})
} catch (error) {
  console.warn(`CredStore desktop launcher was not installed: ${error.message}`)
}
