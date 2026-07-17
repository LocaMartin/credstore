#!/usr/bin/env node

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const lifecycleInstall = args.has("--install")
const quiet = args.has("--quiet")
const yes = args.has("--yes") || args.has("-y") || args.has("--npm-uninstall") || lifecycleInstall
const cleanMobile = args.has("--mobile")
const cleanUninstall = args.has("--uninstall") || args.has("--clean-uninstall") || args.has("--npm-uninstall")

const appId = "com.credstore.app"
const home = os.homedir()
const targets = collectTargets()

if (!yes && !dryRun) {
  console.error("Refusing to delete CredStore vault data without --yes. Use --dry-run to preview.")
  process.exit(1)
}

const removed = []
const missing = []
const failed = []

for (const target of targets) {
  if (!fs.existsSync(target)) {
    missing.push(target)
    continue
  }

  if (dryRun) {
    removed.push(target)
    continue
  }

  try {
    fs.rmSync(target, { recursive: true, force: true })
    removed.push(target)
  } catch (error) {
    failed.push(`${target}: ${error.message}`)
  }
}

if (process.platform === "linux" && !dryRun) {
  spawnSync("update-desktop-database", [path.join(home, ".local", "share", "applications")], { stdio: "ignore" })
}

if (cleanMobile) {
  cleanAndroid()
  cleanIosSimulator()
}

const action = dryRun ? "Would remove" : "Removed"
if (!quiet) {
  for (const target of removed) console.log(`${action}: ${target}`)
  for (const target of missing) console.log(`Not present: ${target}`)
}
for (const item of failed) console.error(`Failed: ${item}`)

if (cleanUninstall && !quiet) {
  console.log("Package uninstall is separate: run npm uninstall -g credstore after cleanup.")
}

if (failed.length > 0) process.exit(1)

function collectTargets() {
  const paths = new Set()

  if (process.platform === "win32") {
    add(paths, process.env.APPDATA, "credstore")
    add(paths, process.env.APPDATA, "CredStore")
    add(paths, process.env.APPDATA, "com.credstore.app")
    add(paths, process.env.LOCALAPPDATA, "credstore")
    add(paths, process.env.LOCALAPPDATA, "CredStore")
    add(paths, process.env.LOCALAPPDATA, "com.credstore.app")
    add(paths, process.env.LOCALAPPDATA, "CredStore", "User Data")
    add(paths, process.env.LOCALAPPDATA, "credstore", "User Data")
  } else if (process.platform === "darwin") {
    add(paths, home, "Library", "Application Support", "credstore")
    add(paths, home, "Library", "Application Support", "CredStore")
    add(paths, home, "Library", "Application Support", "com.credstore.app")
    add(paths, home, "Library", "Caches", "credstore")
    add(paths, home, "Library", "Caches", "CredStore")
    add(paths, home, "Library", "Caches", "com.credstore.app")
    add(paths, home, "Library", "HTTPStorages", "com.credstore.app")
    add(paths, home, "Library", "WebKit", "com.credstore.app")
    add(paths, home, "Library", "Preferences", "com.credstore.app.plist")
    add(paths, home, "Library", "Saved Application State", "com.credstore.app.savedState")
  } else {
    add(paths, process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "credstore")
    add(paths, process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "CredStore")
    add(paths, process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "com.credstore.app")
    add(paths, process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "credstore")
    add(paths, process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "CredStore")
    add(paths, process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "com.credstore.app")
    add(paths, process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "credstore")
    add(paths, process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "CredStore")
    add(paths, process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "com.credstore.app")
    add(paths, process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "applications", "credstore.desktop")
  }

  return Array.from(paths)
}

function add(paths, base, ...segments) {
  if (!base) return
  paths.add(path.join(base, ...segments))
}

function cleanAndroid() {
  const adb = spawnSync("adb", ["shell", "pm", "clear", appId], { encoding: "utf8" })
  if (adb.error) {
    console.log("Android cleanup skipped: adb is not available.")
    return
  }

  const output = `${adb.stdout || ""}${adb.stderr || ""}`.trim()
  if (adb.status === 0) console.log(`Android app data cleared: ${appId}`)
  else console.error(`Android cleanup failed: ${output || `adb exited ${adb.status}`}`)
}

function cleanIosSimulator() {
  const uninstall = spawnSync("xcrun", ["simctl", "uninstall", "booted", appId], { encoding: "utf8" })
  if (uninstall.error) {
    console.log("iOS simulator cleanup skipped: xcrun is not available.")
    return
  }

  if (uninstall.status === 0) {
    console.log(`iOS simulator app uninstalled: ${appId}`)
    return
  }

  const output = `${uninstall.stdout || ""}${uninstall.stderr || ""}`.trim()
  console.error(`iOS simulator cleanup failed: ${output || `xcrun exited ${uninstall.status}`}`)
}
