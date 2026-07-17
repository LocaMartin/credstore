#!/usr/bin/env node

const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")
const pkg = require("../package.json")

const args = process.argv.slice(2)
const debugMode = args.includes("-debug")
const desktopPlatforms = new Set(["linux", "darwin", "win32"])

if (args.includes("-version")) {
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes("-help")) {
  console.log(`CredStore ${pkg.version}

Usage:
  credstore            Launch the CredStore desktop app
  credstore -debug     Launch with debug logging and developer tools
  credstore -version   Print the installed version
  credstore -help      Show this help
`)
  process.exit(0)
}

const appRoot = path.resolve(__dirname, "..")
const electronVersion = (pkg.optionalDependencies?.electron || pkg.devDependencies?.electron || "43.1.0").replace(/^[^\d]*/, "")

const allowedArgs = new Set(["-debug"])
const unknownArgs = args.filter((arg) => !allowedArgs.has(arg))
if (unknownArgs.length > 0) {
  console.error(`Unknown option: ${unknownArgs.join(" ")}`)
  console.error("Run credstore -help for usage.")
  process.exit(1)
}

if (debugMode && !desktopPlatforms.has(process.platform)) {
  console.error("credstore -debug is only supported on Linux, macOS, and Windows desktop builds.")
  process.exit(1)
}

const electronArgs = []
const appArgs = []

for (const arg of args) {
  if (arg === "-debug") appArgs.push("--credstore-debug")
}

if (process.env.CREDSTORE_NO_SANDBOX === "1" && !electronArgs.includes("--no-sandbox")) {
  electronArgs.push("--no-sandbox")
}

launch().catch((error) => {
  console.error(`Failed to launch CredStore: ${error.message}`)
  process.exit(1)
})

async function launch() {
  const electronPath = await resolveElectron()
  const child = spawn(electronPath, [...electronArgs, appRoot, ...appArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      CREDSTORE_DEBUG: debugMode ? "1" : process.env.CREDSTORE_DEBUG,
      CREDSTORE_SKIP_RASP_CHECKS: debugMode ? "1" : process.env.CREDSTORE_SKIP_RASP_CHECKS,
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
}

async function resolveElectron() {
  const packagedPath = findPackagedElectron()
  if (packagedPath) return packagedPath

  const pathElectron = findExecutableOnPath(process.platform === "win32" ? "electron.cmd" : "electron")
  if (pathElectron) return pathElectron

  return downloadElectronToUserCache()
}

function findPackagedElectron() {
  try {
    const electron = require("electron")
    if (typeof electron === "string" && fs.existsSync(electron)) return electron
  } catch {
    // npm may block Electron's install script for global installs. Fall through to user-cache download.
  }

  const executable = process.platform === "win32" ? "electron.exe" : "electron"
  const localPath = path.join(appRoot, "node_modules", "electron", "dist", executable)
  return fs.existsSync(localPath) ? localPath : null
}

function findExecutableOnPath(command) {
  const pathEnv = process.env.PATH || ""
  const entries = pathEnv.split(path.delimiter).filter(Boolean)

  for (const entry of entries) {
    const candidate = path.join(entry, command)
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

async function downloadElectronToUserCache() {
  const { downloadArtifact } = require("@electron/get")
  const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")
  const electronCache = path.join(cacheRoot, "credstore", "electron", electronVersion)
  const executable = process.platform === "win32" ? "electron.exe" : "electron"
  const cachedExecutable = path.join(electronCache, executable)

  if (fs.existsSync(cachedExecutable)) return cachedExecutable

  fs.mkdirSync(electronCache, { recursive: true })
  console.error(`Installing Electron ${electronVersion} into ${electronCache}...`)

  const zipPath = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    cacheRoot,
  })

  await extractElectron(zipPath, electronCache)

  if (!fs.existsSync(cachedExecutable)) {
    throw new Error("Electron download completed, but the executable was not found in the user cache.")
  }

  if (process.platform !== "win32") fs.chmodSync(cachedExecutable, 0o755)
  return cachedExecutable
}

async function extractElectron(zipPath, destination) {
  const extractZip = require("extract-zip")
  await extractZip(zipPath, { dir: destination })
}
