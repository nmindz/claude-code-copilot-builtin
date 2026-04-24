#!/usr/bin/env node

// Guards against the #1 Copilot-proxy footgun: pinning ANTHROPIC_MODEL to a raw
// non-Claude id (e.g. "gpt-5.5"). Claude Code resolves a model *tier* by substring
// match on "sonnet" / "opus" / "haiku". A raw id matches none, so the session runs
// on the degraded "custom model" path and advanced features — most visibly the
// dynamic Workflow tool — are silently withheld.
//
// The fix mirrors what the Z.AI coding-helper does for GLM: leave ANTHROPIC_MODEL
// unset, pick a tier in /model, and map the tier to the real upstream model with
// ANTHROPIC_DEFAULT_{SONNET,OPUS,HAIKU}_MODEL. Tier identity stays "sonnet" → all
// features stay on → the wire request still carries the real Copilot model id.

const TIER_TOKENS = ["sonnet", "opus", "haiku"]

function looksLikeCopilotProxy(baseUrl) {
  if (!baseUrl) return false
  return /localhost|127\.0\.0\.1|githubcopilot|copilot/i.test(baseUrl)
}

function hasTierToken(model) {
  const m = String(model).toLowerCase()
  return TIER_TOKENS.some((t) => m.includes(t))
}

function buildOutput() {
  const model = process.env.ANTHROPIC_MODEL
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const sonnet = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL

  // Only relevant when pointed at a Copilot-style proxy.
  if (!looksLikeCopilotProxy(baseUrl)) return null

  // Healthy config: ANTHROPIC_MODEL unset (tier picker drives identity) OR set to
  // something that still carries a tier token.
  if (!model || hasTierToken(model)) return null

  const suggested = model
  const warning =
    `Copilot config warning: ANTHROPIC_MODEL="${model}" pins a raw model id with no ` +
    `tier token (sonnet/opus/haiku). Claude Code will run this session on the ` +
    `degraded custom-model path and withhold advanced features — the dynamic ` +
    `Workflow tool will fail. Fix: remove ANTHROPIC_MODEL and add tier aliases ` +
    `(ANTHROPIC_DEFAULT_SONNET_MODEL="${suggested}", ANTHROPIC_DEFAULT_OPUS_MODEL="${suggested}", ` +
    `CLAUDE_CODE_SUBAGENT_MODEL="sonnet"), then select Sonnet in /model. ` +
    `Run /copilot-setup to apply this automatically.`

  const context =
    `This session is Copilot-backed but misconfigured: ANTHROPIC_MODEL is pinned to ` +
    `"${model}", which disables the Workflow tool and other tier-gated features. ` +
    `If the user asks for a workflow or it fails as "unsupported model", tell them to ` +
    `run /copilot-setup (or unset ANTHROPIC_MODEL and use ANTHROPIC_DEFAULT_SONNET_MODEL), ` +
    `then restart Claude Code and pick Sonnet in /model.` +
    (sonnet ? "" : " No ANTHROPIC_DEFAULT_SONNET_MODEL is set either.")

  return {
    systemMessage: warning,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  }
}

function main() {
  try {
    const out = buildOutput()
    if (out) process.stdout.write(JSON.stringify(out))
  } catch {
    // Silent fail: never break the session because of a config check.
  }
}

main()
