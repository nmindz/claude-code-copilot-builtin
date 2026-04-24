#!/usr/bin/env node

function getToolInput(input) {
  return input.tool_input || input.toolInput || input.input || {}
}

function extractUrls(command) {
  return [...command.matchAll(/https?:\/\/[^\s"')]+/gi)].map((match) => match[0])
}

function isLocalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  } catch {
    return false
  }
}

function looksLikeDirectWebFetch(command) {
  const hasFetchCli = /(^|\s)(curl|wget|lynx|links|w3m|http|xh)(\s|$)/i.test(command)
  const hasPythonHttp =
    /(^|\s)python(3)?(\s|$)/i.test(command) &&
    /(requests|urllib|httpx|aiohttp)/i.test(command)
  const hasNodeHttp =
    /(^|\s)(node|nodejs|bun|deno)(\s|$)/i.test(command) &&
    /(fetch\(|axios|https?\.get\()/i.test(command)

  return hasFetchCli || hasPythonHttp || hasNodeHttp
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) return

    const input = JSON.parse(raw)
    const toolName = input.tool_name || input.toolName
    if (toolName !== "Bash") return

    const toolInput = getToolInput(input)
    const command = typeof toolInput.command === "string" ? toolInput.command : ""
    if (!command.trim()) return
    if (/(^|\s)pinchtab(\s|$)/i.test(command)) return

    const urls = extractUrls(command).filter((url) => !isLocalUrl(url))
    if (urls.length === 0) return
    if (!looksLikeDirectWebFetch(command)) return

    const reason = [
      "Direct web fetching/search via Bash is blocked in this Copilot-backed session when PinchTab is available.",
      "Use PinchTab MCP tools instead of curl/wget or ad-hoc HTTP clients."
    ].join(" ")

    const additionalContext = [
      "Do not use Bash HTTP clients to bypass WebFetch/WebSearch replacement.",
      "Use PinchTab MCP tools instead.",
      `Blocked command targeted: ${JSON.stringify(command)}.`,
      "For fetch: `mcp__pinchtab__pinchtab_navigate` -> `mcp__pinchtab__pinchtab_get_text` -> optional `mcp__pinchtab__pinchtab_snapshot`.",
      "For search: navigate to a DuckDuckGo query URL first, then inspect results with PinchTab."
    ].join(" ")

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
    // Silent fail: never break the session because of hook/runtime issues.
  }
}

main()
