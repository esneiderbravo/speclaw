# Backend checks — add-spec-owners (2026-08-25)

Date · Branch · Environment: 2026-08-25 · `feat/spec-owners` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier + ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` + asset copy (3 modules) |
| Unit + integration | `npm test` | ✅ 461 passed, 0 failed · coverage lines 85.03% / branches 80.43% / functions 84.99% |

## Tests added / updated

| File | Asserts |
| --- | --- |
| `test/unit/owners.test.ts` | Token syntax, YAML parse (inline + dashed + derive), render (no src derive), merge-at-end, content-after trap, write/check/doctor/refresh paths |
| `test/integration/owners.test.ts` | Help lists `owners`, MCP stays at 8 tools, CLI `--write`/`--check` round-trip, absent no-op, bad-token CLI failure |

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Named capability becomes a CODEOWNERS pattern | unit `writeOwners compiles…` + dogfood `owners --write` |
| Star owners cover config and standards | unit render + dogfood CODEOWNERS |
| User rules before the block survive a rewrite | unit merge + integration round-trip |
| Rewriting updates only the marked region | unit merge rewrite |
| No team.owners leaves CODEOWNERS untouched | unit + integration absent no-op |
| Typo token fails write | unit + integration CLI |
| Valid forms accepted without network | unit `isValidOwnerToken` + doctor offline |
| Default compile emits only declared paths | unit render with `derive: true` still no `src/` |
| Content after end marker is an error | unit doctor + check |
| Decorative CODEOWNERS warning | unit + live `doctor --json --offline` |
| Absent team.owners skips owners checks | unit doctor skip |
| Update refreshes / migration note | code path `refreshOwnersIfConfigured` in scaffold + `MIGRATIONS` 0.4.1 (exercised via unit refresh) |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Backend owners compiler, doctor posture, and CLI wiring meet the delta specs; gates green.
