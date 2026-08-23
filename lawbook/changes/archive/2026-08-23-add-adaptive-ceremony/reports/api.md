# API report — add-adaptive-ceremony

## Header

MCP `lawbook_level` and CLI `speclaw quick` / `speclaw lawbook level` surfaces.

## Contract

| Surface | Contract |
| --- | --- |
| MCP `lawbook_level` | modes `propose` \| `set` \| `promote` \| `explain`; in `MINIMAL_OMIT` |
| CLI `speclaw quick <name>` | level-0 scaffold; `--json` |
| CLI `speclaw lawbook level` | same modes; `--json` suppresses header |
| Doctor | `cfg.ceremony.cuts`, `cfg.ceremony.levels` |

## Tests

- `test/contract/registers.test.ts` includes `lawbook_level`
- `test/unit/mcp-budget.test.ts` asserts minimal omits `lawbook_level`

## Manual

- Help text mentions `quick`
- Doctor JSON exposes ceremony checks (offline)

## Verdict

pass
