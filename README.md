# claude-code-copilot-builtin

Claude Code plugin for GitHub Copilot-backed sessions.

Purpose: expose PinchTab MCP natively and intercept Claude Code built-in web tools that break behind Copilot, so Claude can continue with PinchTab instead of failing mid-run.

## What this plugin does

- registers PinchTab MCP natively via plugin manifest
- intercepts `WebFetch`
- intercepts `WebSearch`
- injects replacement guidance so Claude switches to PinchTab MCP tools
- reinforces replacement guidance at `SessionStart`
- blocks common Bash-based web-fetch bypasses (`curl`, `wget`, similar direct HTTP fetches)
- prefers DuckDuckGo for all search replacement flows

## PinchTab MCP registration

Plugin now declares PinchTab MCP and also checks bridge availability on `SessionStart`.
If `pinchtab health` fails, plugin starts:

```bash
pinchtab bridge
```

Current PinchTab CLI runs bridge headless by default; `bridge --headless` is not a valid flag.
Plugin waits briefly for health to come up, then continues.

Plugin now declares:

```json
{
  "mcpServers": {
    "pinchtab": {
      "type": "stdio",
      "command": "pinchtab",
      "args": ["mcp"]
    }
  }
}
```

Requirement: `pinchtab` binary must already be available in `PATH`.

Equivalent manual Claude settings entry:

```json
{
  "mcpServers": {
    "pinchtab": {
      "command": "pinchtab",
      "args": ["mcp"]
    }
  }
}
```

## Tool mapping

### `WebSearch` → PinchTab

Hook blocks builtin `WebSearch` call and tells Claude to use PinchTab MCP instead:

1. `mcp__pinchtab__pinchtab_navigate` to DuckDuckGo results URL
2. `mcp__pinchtab__pinchtab_get_text` to read results
3. optionally `mcp__pinchtab__pinchtab_snapshot` when result structure or clickable refs matter

Domain filters are preserved by rewriting query terms with:

- `site:domain` for `allowed_domains`
- `-site:domain` for `blocked_domains`

### `WebFetch` → PinchTab

Hook blocks builtin `WebFetch` call and tells Claude to use PinchTab MCP instead:

1. `mcp__pinchtab__pinchtab_navigate` to target URL
2. `mcp__pinchtab__pinchtab_get_text` for readable page content
3. optionally `mcp__pinchtab__pinchtab_snapshot` for interactive/app-like pages
4. Claude answers original extraction prompt from returned PinchTab content

## How it works

Plugin uses:

- `SessionStart` hook to ensure PinchTab bridge is up and inject session-level guidance
- `PreToolUse` hook for `WebFetch|WebSearch` to deny builtin calls and describe exact PinchTab replacement steps
- `PreToolUse` hook for `Bash` to block common direct-web bypass commands when they target non-local HTTP URLs

This closes the common failure mode where the agent sees `WebFetch` blocked, then falls back to `curl`/`wget` instead of using PinchTab MCP.

## Configuration

Optional env vars:

- `COPILOT_INTERCEPT_TOOLS=WebFetch,WebSearch`
- `COPILOT_UNSUPPORTED_TOOLS=WebFetch,WebSearch` — legacy alias, still supported

If unset, default intercepted tools are `WebFetch,WebSearch`.

## Local testing

This plugin is intended to be enabled only in `/Users/evandro.camargo/.claude/settings.copilot.json`.
