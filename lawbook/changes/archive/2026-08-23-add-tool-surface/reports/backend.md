# Backend discipline report — add-tool-surface

verdict: pass

## Scope

Consolidated MCP surface to eight canonical tools with shared catalog,
deprecation logging, output budgeting, enriched explore, find/diff-context,
lawbook_change dispatch, and speclaw_setup. Fixed working-tree detection
for `diffContext` via `worktreeChangedFiles`.

## Quality gates

| Gate | Result |
| --- | --- |
| `npm run check` | pass |
| `npm run build` | pass |
| `npm test` | pass (coverage ≥80% lines/functions/branches) |

## Tests added or updated

- `test/integration/mcp-surface.test.ts` — eight canonical tools, alias word cap
- `test/integration/tool-surface-benchmark.test.ts` — definition-token ceiling
- `test/unit/output-budget.test.ts` — truncation preserves totals
- `test/unit/deprecation.test.ts` — JSONL log + scan
- `test/unit/diff-context.test.ts` — explicit paths + git worktree
- `test/contract/registers.test.ts` — consolidated surface contracts
- `test/unit/mcp-budget.test.ts` — minimal omit-set (4 tools)
- `test/unit/doctor-report.test.ts` — `cfg.tool-surface` id

## Manual verification

- [x] `SPECLAW_NO_ALIASES=1`: 8 canonical tools register
- [x] Deprecated alias delegates with `[deprecated]` prefix (registers test)
- [x] `diff-context` CLI wired; worktree changes detected after fix
- [x] Doctor reports surface cost + alias log path

## Notes

- `ai-specs/` in this checkout is root-owned and could not be rewritten in-place;
  managed assets under `src/modules/lawbook/assets/` carry the new tool names.
