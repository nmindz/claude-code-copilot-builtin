#!/usr/bin/env node

// Fetches GitHub Copilot quota from the local copilot-api proxy (ericc-ch/copilot-api)
// via its GET /usage endpoint and prints a compact summary. Exit non-zero on failure
// so callers can detect an unreachable proxy.
//
// Base URL resolution: --url flag > COPILOT_USAGE_URL > ANTHROPIC_BASE_URL > default.

const DEFAULT_BASE = "http://localhost:4141"

function resolveBase() {
  const flagIdx = process.argv.indexOf("--url")
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1]
  return process.env.COPILOT_USAGE_URL || process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE
}

function pct(n) {
  return typeof n === "number" ? `${Math.round(n)}%` : "?"
}

function line(label, q) {
  if (!q) return `${label}: n/a`
  if (q.unlimited) return `${label}: unlimited`
  return `${label}: ${pct(q.percent_remaining)} left (${q.quota_remaining ?? q.remaining}/${q.entitlement})`
}

async function main() {
  const base = resolveBase().replace(/\/$/, "")
  const json = process.argv.includes("--json")

  let res
  try {
    res = await fetch(`${base}/usage`, { signal: AbortSignal.timeout(5000) })
  } catch (e) {
    console.error(`copilot-usage: cannot reach proxy at ${base} (${e.message}). Is copilot-api running?`)
    process.exit(2)
  }

  if (!res.ok) {
    console.error(`copilot-usage: ${base}/usage returned HTTP ${res.status}`)
    process.exit(3)
  }

  const data = await res.json()
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2))
    return
  }

  const snaps = data.quota_snapshots || {}
  const out = [
    `Copilot plan: ${data.copilot_plan || "?"}  (resets ${data.quota_reset_date || "?"})`,
    line("Premium (GPT-5.x)", snaps.premium_interactions),
    line("Chat", snaps.chat),
    line("Completions", snaps.completions),
  ]
  process.stdout.write(out.join("\n") + "\n")
}

main().catch((e) => {
  console.error(`copilot-usage: ${e.message}`)
  process.exit(1)
})
