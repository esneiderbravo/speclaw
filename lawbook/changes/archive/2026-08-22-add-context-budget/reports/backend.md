# Backend checks — add-context-budget (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/context-budget` · `/Users/esneiderbravo/Projects/speclaw` (Node local)

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ Prettier clean; ESLint clean (`dist-test/**` ignored) |
| Build | `npm run build` | ✅ `tsc` + copy-assets |
| Tests + coverage | `npm test` | ✅ 254 passed, 0 failed; coverage ≥80% (all files ~97% lines) |

## Tests added / updated

- `test/unit/tokens.test.ts` — determinism, monotonicity, edge cases
- `test/unit/budget.test.ts` — suite gate vs `token-budget.json`; minimal profile ceilings
- `test/unit/skill-steps.test.ts` — dispatcher budget; successor-only step chains
- `test/unit/mcp-budget.test.ts` — `defineTool` caps; description ≤25 words; map markers; manifest `minimal`
- `test/contract/registers.test.ts` — law_verify word ceiling tightened to 25

## Spec-scenario coverage

| Scenario | Verified by |
| :-- | :-- |
| Budget command reports every surface | Manual `speclaw budget --json` + `budget.test.ts` |
| Tool schema included in cost | `budget.test.ts` schema size assertion |
| Estimator deterministic / offline | `tokens.test.ts` |
| Exceeding budget fails suite | `budget.test.ts` gate (ceilings set above measured) |
| Single tool over cap fails at registration | `mcp-budget.test.ts` |
| Descriptions ≤25 words | `mcp-budget.test.ts` + contract test |
| Default / minimal exposure | `mcp-budget.test.ts` + `budget.test.ts` |
| Minimal persists across update write | `mcp-budget.test.ts` manifest test |
| JIT dispatcher + successor-only steps | `skill-steps.test.ts` |
| Map regenerate / missing markers | `mcp-budget.test.ts` |
| Doctor reports mode and cost | Manual `speclaw doctor` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Backend measurement, caps, profiles, JIT skills, and map generation meet the delta spec; gates green.
