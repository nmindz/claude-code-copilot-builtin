#!/usr/bin/env node

const { execFile, spawn } = require("node:child_process")
const { promisify } = require("node:util")

const execFileAsync = promisify(execFile)

const HEALTH_TIMEOUT_MS = 3000
const STARTUP_WAIT_MS = 15000
const POLL_INTERVAL_MS = 500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isBridgeHealthy() {
  try {
    await execFileAsync("pinchtab", ["health"], {
      timeout: HEALTH_TIMEOUT_MS,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

function startBridgeDetached(args) {
  const child = spawn("pinchtab", args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })

  child.unref()
}

async function waitForBridge(waitMs) {
  const deadline = Date.now() + waitMs

  while (Date.now() < deadline) {
    if (await isBridgeHealthy()) return true
    await sleep(POLL_INTERVAL_MS)
  }

  return false
}

function buildSessionStartOutput(startedBridge) {
  const additionalContext = [
    "In Copilot-backed sessions, never use builtin `WebFetch` or `WebSearch`.",
    "Use PinchTab MCP tools instead.",
    "For URL fetches: call `mcp__pinchtab__pinchtab_navigate`, then `mcp__pinchtab__pinchtab_get_text`, and `mcp__pinchtab__pinchtab_snapshot` when structure matters.",
    "For searches: navigate to a DuckDuckGo search URL with `mcp__pinchtab__pinchtab_navigate`, then read results with `mcp__pinchtab__pinchtab_get_text` or `mcp__pinchtab__pinchtab_snapshot`.",
    "Do not bypass this with Bash/curl/wget or ad-hoc HTTP clients for public web fetching/search when PinchTab is available."
  ].join(" ")

  return {
    ...(startedBridge
      ? { systemMessage: "Started PinchTab bridge for this session." }
      : {}),
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext
    }
  }
}

async function main() {
  try {
    if (await isBridgeHealthy()) {
      process.stdout.write(JSON.stringify(buildSessionStartOutput(false)))
      return
    }

    // Current PinchTab bridge runs headless by default. CLI exposes
    // `pinchtab bridge`, while `pinchtab server` offers `--headed` to opt out.
    startBridgeDetached(["bridge"])

    const healthy = await waitForBridge(STARTUP_WAIT_MS)
    if (!healthy) return

    process.stdout.write(JSON.stringify(buildSessionStartOutput(true)))
  } catch {
    // Silent fail: never break the session because of hook/runtime issues.
  }
}

main()
