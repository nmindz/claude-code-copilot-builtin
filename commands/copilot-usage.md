---
description: Show GitHub Copilot quota (premium/chat/completions) from the local copilot-api proxy
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-usage.mjs"
```

- Report output verbatim. Add 1 line on premium (GPT-5.x) headroom.
- Non-zero exit → proxy down. Tell user: `cd ~/Projects/_myself/copilot-api && bun run ./src/main.ts start`
- No invented numbers. Report only script output.
