#!/usr/bin/env node

const DEFAULT_INTERCEPTED_TOOLS = ["WebFetch", "WebSearch"]

function getInterceptedTools() {
  const fromEnv =
    process.env.COPILOT_INTERCEPT_TOOLS || process.env.COPILOT_UNSUPPORTED_TOOLS
  if (!fromEnv) return DEFAULT_INTERCEPTED_TOOLS

  const parsed = fromEnv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  return parsed.length > 0 ? parsed : DEFAULT_INTERCEPTED_TOOLS
}

function getToolInput(input) {
  return input.tool_input || input.toolInput || input.input || {}
}

function buildDuckDuckGoUrl(toolInput) {
  const parts = []

  if (typeof toolInput.query === "string" && toolInput.query.trim()) {
    parts.push(toolInput.query.trim())
  }

  if (Array.isArray(toolInput.allowed_domains)) {
    for (const domain of toolInput.allowed_domains) {
      if (typeof domain === "string" && domain.trim()) {
        parts.push(`site:${domain.trim()}`)
      }
    }
  }

  if (Array.isArray(toolInput.blocked_domains)) {
    for (const domain of toolInput.blocked_domains) {
      if (typeof domain === "string" && domain.trim()) {
        parts.push(`-site:${domain.trim()}`)
      }
    }
  }

  const query = parts.join(" ").trim()
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
}

function buildWebSearchReplacement(toolInput) {
  const query = typeof toolInput.query === "string" ? toolInput.query.trim() : ""
  const searchUrl = buildDuckDuckGoUrl(toolInput)

  const reason = [
    "WebSearch is intercepted in Copilot-backed Claude Code sessions.",
    "Replace it with PinchTab MCP.",
    "Preferred search engine: DuckDuckGo."
  ].join(" ")

  const additionalContext = [
    "Do not retry `WebSearch`.",
    "Replace this call with PinchTab MCP tools.",
    `1. Call \`mcp__pinchtab__pinchtab_navigate\` with ${JSON.stringify({ url: searchUrl })}.`,
    "2. Read results with `mcp__pinchtab__pinchtab_get_text`.",
    "3. If clickable result structure matters, also call `mcp__pinchtab__pinchtab_snapshot`.",
    query ? `Original search intent: ${JSON.stringify(query)}.` : "",
    Array.isArray(toolInput.allowed_domains) && toolInput.allowed_domains.length > 0
      ? `Allowed domains already encoded into DuckDuckGo query via site: filters: ${toolInput.allowed_domains.join(", ")}.`
      : "",
    Array.isArray(toolInput.blocked_domains) && toolInput.blocked_domains.length > 0
      ? `Blocked domains already encoded into DuckDuckGo query via -site: filters: ${toolInput.blocked_domains.join(", ")}.`
      : "",
    "Continue task from PinchTab results and include sources normally."
  ]
    .filter(Boolean)
    .join(" ")

  return { reason, additionalContext }
}

function buildWebFetchReplacement(toolInput) {
  const url = typeof toolInput.url === "string" ? toolInput.url.trim() : ""
  const prompt = typeof toolInput.prompt === "string" ? toolInput.prompt.trim() : ""

  const reason = [
    "WebFetch is intercepted in Copilot-backed Claude Code sessions.",
    "Replace it with PinchTab MCP."
  ].join(" ")

  const additionalContext = [
    "Do not retry `WebFetch`.",
    "Replace this call with PinchTab MCP tools.",
    url
      ? `1. Call \`mcp__pinchtab__pinchtab_navigate\` with ${JSON.stringify({ url })}.`
      : "1. Call `mcp__pinchtab__pinchtab_navigate` with target URL.",
    "2. Call `mcp__pinchtab__pinchtab_get_text` to fetch readable page text.",
    "3. If page is app-like, interactive, or text extraction misses key structure, also call `mcp__pinchtab__pinchtab_snapshot`.",
    prompt ? `After fetching, answer original extraction prompt: ${JSON.stringify(prompt)}.` : "",
    "Continue task using PinchTab output instead of builtin WebFetch output."
  ]
    .filter(Boolean)
    .join(" ")

  return { reason, additionalContext }
}

function buildReplacement(toolName, toolInput) {
  if (toolName === "WebSearch") return buildWebSearchReplacement(toolInput)
  if (toolName === "WebFetch") return buildWebFetchReplacement(toolInput)

  return {
    reason: `${toolName} is intercepted in Copilot-backed Claude Code sessions.`,
    additionalContext: `Do not retry ${toolName}. Use PinchTab MCP tools instead.`
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function main() {
  let raw = ""
  try {
    raw = await readStdin()
    if (!raw.trim()) return

    const input = JSON.parse(raw)
    const toolName = input.tool_name || input.toolName
    if (!toolName) return

    const interceptedTools = new Set(getInterceptedTools())
    if (!interceptedTools.has(toolName)) return

    const toolInput = getToolInput(input)
    const { reason, additionalContext } = buildReplacement(toolName, toolInput)

    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
          additionalContext
        }
      })
    )
  } catch {
    // Silent fail: never break the session because of hook parsing/runtime issues.
  }
}

main()
