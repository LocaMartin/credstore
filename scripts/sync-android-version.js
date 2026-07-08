const fs = require("fs")
const path = require("path")

const pkg = require("../package.json")
const configPath = path.join(__dirname, "..", "android", "app", "src", "main", "res", "xml", "config.xml")

if (!fs.existsSync(configPath)) {
  throw new Error(`Missing Android config.xml at ${configPath}`)
}

const current = fs.readFileSync(configPath, "utf8")
const updated = current.replace(/<widget version="[^"]+"/, `<widget version="${pkg.version}"`)

if (updated === current) {
  throw new Error("Could not update widget version in Android config.xml")
}

fs.writeFileSync(configPath, updated)
console.log(`Synced Android widget version to ${pkg.version}`)
