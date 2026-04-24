---
description: Apply tier-aliasing to the active Copilot settings profile so workflows + tier-gated features work
---

Goal: stop Claude Code running on the degraded custom-model path with a Copilot proxy. Cause: `ANTHROPIC_MODEL` pinned to raw id (e.g. `gpt-5.5`) → no tier token (sonnet/opus/haiku) → Workflow tool + advanced features withheld. Fix: tier aliasing (mirrors Z.AI GLM helper).

Steps:

1. Find active settings file. Order: `$CLAUDE_CONFIG_PATH` env > `~/.claude/settings.copilot.json` (if Copilot profile) > `~/.claude/settings.json`. Ask user if ambiguous.
2. Read its `env` block.
3. Patch (only if `ANTHROPIC_BASE_URL` points at copilot-api / localhost):
   - DELETE `ANTHROPIC_MODEL`
   - SET `ANTHROPIC_DEFAULT_SONNET_MODEL` = old `ANTHROPIC_MODEL` value (else `gpt-5.5`)
   - SET `ANTHROPIC_DEFAULT_OPUS_MODEL` = same
   - KEEP/SET `ANTHROPIC_DEFAULT_HAIKU_MODEL` = `gpt-5-mini`
   - SET `CLAUDE_CODE_SUBAGENT_MODEL` = `sonnet`
4. Preserve all other keys. Write back valid JSON.
5. Tell user: restart Claude Code, pick **Sonnet** in `/model`. Wire requests still carry the real id (`gpt-5.5`) → proxy routes gpt-5.x → Responses API. Tier identity = sonnet → Workflow on.

Target env result:

```json
"ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-5.5",
"ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-5.5",
"ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5-mini",
"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
```

Confirm diff with user before write.
