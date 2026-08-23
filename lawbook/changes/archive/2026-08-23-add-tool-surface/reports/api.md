# API discipline report — add-tool-surface

verdict: pass

## Breaking change (v0.4.0)

Full MCP profile exposes **eight** canonical tools (aliases optional):

| Tool | Replaces (aliases) |
| --- | --- |
| `compass_explore` | impact, trace, hotspots (partial), affected_tests |
| `compass_find` | compass_search, compass_recall |
| `compass_diff_context` | (new) |
| `compass_index` | compass_watch |
| `lawbook_change` | lawbook_init/list/validate/sync/archive/level/coverage/drift |
| `lawbook_investigate` | unchanged |
| `speclaw_setup` | init_project, configure_agent, add_pack, list_packs |
| `speclaw_check` | unchanged |

**CLI-only (removed from MCP):** `scaffold`, `doctor`, `compass_visualize`, `law_verify`

## Budget (measured, `SPECLAW_NO_ALIASES=1`)

- Full: 8 tools · ~1.6k tool-definition tokens · ~12.9k always-on
- Minimal: 4 tools (explore, find, diff_context, lawbook_change)
- Ceilings: `token-budget.json` tools 1800, skills 3000, total 13000

## Deprecation policy

- Aliases register when `SPECLAW_NO_ALIASES` unset; responses prefixed `[deprecated]`
- Invocations logged to `.speclaw/deprecated-calls.jsonl`
- Doctor check `cfg.tool-surface` reports cost, alias usage, stale references
- Removal target: v0.6.0

## CLI parity

- Added `speclaw diff-context` (`--file`, `--rev`, `--worktree`, `--json`)
- `speclaw update` migration 0.4.0 prompts agents about canonical names

## Quality gates

| Gate | Result |
| --- | --- |
| Contract tests | pass |
| Budget gate | pass |
| MCP surface integration | pass |
