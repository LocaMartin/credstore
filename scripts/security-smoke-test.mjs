import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const failures = []

const explicitSourceFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "electron/main.js",
  "lib/secure-vault.ts",
  "reset-credstore.ts",
  "scripts/postinstall-desktop.js",
  "CHANGELOG.md",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/com/credstore/app/MainActivity.java",
  "android/app/src/main/res/xml/network_security_config.xml",
]

const sourceFiles = [
  ...explicitSourceFiles,
  ...walk("components").filter((file) => /\.(tsx?|jsx?)$/.test(file)),
]

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function walk(relativeDir) {
  const dir = path.join(root, relativeDir)
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name)

    if (entry.isDirectory()) {
      files.push(...walk(relativePath))
    } else {
      files.push(relativePath)
    }
  }

  return files
}

for (const file of sourceFiles) {
  const lines = read(file).split("\n")
  const longLine = lines.findIndex((line) => line.length > 180)

  assert(longLine === -1, `${file}:${longLine + 1} is longer than 180 characters`)
}

const appSource = read("app/page.tsx")
const electronSource = read("electron/main.js")
const layoutSource = read("app/layout.tsx")
const manifest = read("android/app/src/main/AndroidManifest.xml")
const mainActivity = read("android/app/src/main/java/com/credstore/app/MainActivity.java")
const vaultSource = read("lib/secure-vault.ts")

assert(!/\bfetch\s*\(/.test(appSource), "app/page.tsx must not call fetch")
assert(!/\bXMLHttpRequest\b/.test(appSource), "app/page.tsx must not use XMLHttpRequest")
assert(!/\bWebSocket\b/.test(appSource), "app/page.tsx must not use WebSocket")
assert(layoutSource.includes("connect-src 'none'"), "CSP must block outbound connections")
assert(electronSource.includes("onBeforeRequest"), "Electron must install request blocking")
assert(electronSource.includes("setPermissionRequestHandler"), "Electron must deny runtime permissions")
assert(electronSource.includes("sandbox: true"), "Electron renderer sandbox must be enabled")
assert(manifest.includes('android:allowBackup="false"'), "Android backup must be disabled")
assert(manifest.includes('android.permission.INTERNET" tools:node="remove"'), "Android Internet permission must be removed")
assert(mainActivity.includes("FLAG_SECURE"), "Android FLAG_SECURE must be enabled")
assert(vaultSource.includes("iterations: KDF_ITERATIONS"), "Vault must use configured PBKDF2 iterations")
assert(vaultSource.includes("additionalData"), "AES-GCM must bind encrypted data to a context")

if (failures.length) {
  console.error("Security smoke tests failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Security smoke tests passed")
