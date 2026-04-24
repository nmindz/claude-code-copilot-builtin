# claude-code-copilot-builtin

Claude Code plugin for GitHub Copilot-backed sessions.

Purpose: expose PinchTab MCP natively and intercept Claude Code built-in web tools that break behind Copilot, so Claude can continue with PinchTab instead of failing mid-run.

## What this plugin does

- guards against the model tier-aliasing footgun that silently disables the dynamic Workflow tool
- ships `/copilot-setup` to apply the correct tier-aliasing settings
- ships `/copilot-usage` to read Copilot quota from the local copilot-api proxy
- registers PinchTab MCP natively via plugin manifest
- intercepts `WebFetch`
- intercepts `WebSearch`
- injects replacement guidance so Claude switches to PinchTab MCP tools
- reinforces replacement guidance at `SessionStart`
- blocks common Bash-based web-fetch bypasses (`curl`, `wget`, similar direct HTTP fetches)
- prefers DuckDuckGo for all search replacement flows

## Model tier-aliasing (why workflows break, and the fix)

Claude Code decides a model's *tier* by substring-matching the model id against
`sonnet` / `opus` / `haiku`. Advanced features — most visibly the dynamic
**Workflow** tool — are gated on a recognized tier.

Pinning `ANTHROPIC_MODEL` to a raw Copilot id (e.g. `gpt-5.5`) matches no tier,
so the session runs on the degraded "custom model" path and the Workflow tool
fails (the model usually paraphrases this as an "unsupported model" error).

The fix mirrors what Z.AI's coding-helper does for GLM: leave `ANTHROPIC_MODEL`
unset and map tiers to the real upstream model. The wire request still carries
the real id (`gpt-5.5`), so the copilot-api proxy still routes gpt-5.x to the
Responses API — only Claude Code's internal tier identity changes.

```jsonc
// ~/.claude/settings.copilot.json  (env block)
"ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
"ANTHROPIC_DEFAULT_OPUS_MODEL":   "gpt-5.5",
"ANTHROPIC_DEFAULT_HAIKU_MODEL":  "gpt-5-mini",
"CLAUDE_CODE_SUBAGENT_MODEL":     "sonnet"
// and DELETE "ANTHROPIC_MODEL"
```

After applying, restart Claude Code and pick **Sonnet** in `/model`.

A `SessionStart` hook (`hooks/check-model-config.js`) detects the bad config
(a raw `ANTHROPIC_MODEL` while pointed at a Copilot/localhost proxy) and warns
the user, pointing them at `/copilot-setup`. It is silent when the config is
healthy or the base URL is not a Copilot proxy.

Note: a plugin cannot write `ANTHROPIC_*` env into your settings itself — that
lives in `settings.json`. `/copilot-setup` applies it for you; the hook only
detects and warns.

## Commands

### `/copilot-setup`

Patches the active settings profile to the tier-aliasing layout above (removes
`ANTHROPIC_MODEL`, adds tier defaults + subagent tier). Confirms the diff before
writing.

### `/copilot-usage`

Runs `scripts/copilot-usage.mjs`, which fetches `GET /usage` from the local
copilot-api proxy and prints plan + quota (premium / chat / completions). Base
URL resolves from `--url` > `COPILOT_USAGE_URL` > `ANTHROPIC_BASE_URL` >
`http://localhost:4141`.

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

