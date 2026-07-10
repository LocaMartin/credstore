import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const manifestPath = path.join(root, "electron", "integrity-manifest.json")
const targets = ["electron/main.js", "electron/preload.js", ...walk("out")]
  .filter((file) => !file.endsWith(".map"))
  .sort()

const files = {}

for (const relativePath of targets) {
  const absolutePath = path.join(root, relativePath)
  files[relativePath] = sha256(absolutePath)
}

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      algorithm: "sha256",
      generatedAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  )}\n`,
)

console.log(`Generated ${path.relative(root, manifestPath)} with ${targets.length} file hashes`)

function walk(relativeDir) {
  const dir = path.join(root, relativeDir)
  if (!fs.existsSync(dir)) return []

  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) files.push(...walk(relativePath))
    else files.push(relativePath)
  }
  return files
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}
