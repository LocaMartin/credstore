#!/usr/bin/env node

const { spawn } = require("child_process")
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
  credstore --version  Print the installed version
  credstore --help     Show this help
`)
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
