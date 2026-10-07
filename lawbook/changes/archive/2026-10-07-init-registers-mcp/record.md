# init-registers-mcp

**Level:** 0 (proposed: n/a, confirmed by: human)
**Why:** 0 file(s), 0 module(s), 0 affected test(s), 0 blast node(s), no public API, no global file, hotspot=0.00, degraded:[no-targets] → score 0 → level none (cuts 3/8/15)

## What changes

Default init registers the speclaw MCP server (generic agent writes .mcp.json), and agent add / configure-agent install the agent's hooks (SessionStart, PostToolUse, Stop) with a recorded baseline — before, a fresh init had no Compass tools and an added Claude Code had no ship-on-stop hook, so work was never recorded in the lawbook.

## Steps

- [x] Make the fix
- [x] Add or update a regression test
- [x] Record evidence under reports/

## Evidence

- `reports/` — add a discipline report before archive
