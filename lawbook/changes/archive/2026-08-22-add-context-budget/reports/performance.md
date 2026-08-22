# Performance checks — add-context-budget (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/context-budget` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Budget gate (offline) | `npm test` → `budget.test.ts` | ✅ always-on ≤ 13 000 |
| Measured full profile | `speclaw budget --json` | ✅ total **11 814** (A 2 674 · B 2 280 · C 6 860) |
| Measured minimal profile | `speclaw budget --json --minimal` | ✅ tools **875** / 7 tools; total **~9.9k** |
| Spec Kit comparison | README + CLI footer | ✅ ~18 600 cited (spec-kit#1401) |

## Tests added / updated

- Suite gate encodes the performance budget as a failing test when ceilings rise without a PR to `token-budget.json`.
- Estimator stays offline (no network in gate).

## Spec-scenario coverage

| Scenario | Verified by |
| :-- | :-- |
| Declared budget enforcement | `budget.test.ts` |
| Budget gate stays offline | `tokens.test.ts` + no network in measure path |
| Map ≤300 tokens | `mcp-budget.test.ts` + live `docs/compass.md` map block |
| Dispatcher under budget | `skill-steps.test.ts` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none — `npm run budget:calibrate` is optional maintenance when an API key is available.

## Verdict

Always-on cost is measured, published (~11.7k vs Spec Kit ~18.6k), and gated at 13k; minimal mode cuts tool definitions to ~875 tokens.
