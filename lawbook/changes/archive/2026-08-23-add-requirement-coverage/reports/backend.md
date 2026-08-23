# Backend report — add-requirement-coverage

| Field | Value |
| --- | --- |
| Discipline | backend |
| Change | add-requirement-coverage |
| Date | 2026-08-23 |
| Branch | feat/requirement-coverage |
| Environment | `/Users/esneiderbravo/Projects/speclaw` (local, Node 24) |

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | pass |
| Typecheck + build | `npm run build` | pass |
| Tests | `npm test` | pass (283) |

## Tests added / updated

| Test | Asserts |
| --- | --- |
| `test/unit/coverage.test.ts` | Spec-item parse (ids, Needs, inline links); glob match; missing coverage → exit 1; no ids → exit 0; adopt proposals |
| `test/unit/untrack.test.ts` | `reportTrackedLocalContent` silent when nothing tracked (`req~ai-specs-untrack-hint~1`) |
| `test/integration/scaffold.test.ts` | Covers comments for gitignore + IDE-committable requirements |
| `test/contract/registers.test.ts` | `lawbook_coverage` registered |
| `test/unit/budget.test.ts` | Minimal tool count 7 → 8 (`lawbook_coverage` kept in minimal) |

## Spec-scenario coverage

| Scenario (delta) | How verified |
| --- | --- |
| Identifier parsed from heading | unit: `parseSpecItems` |
| Requirements without ids ignored | unit: unidentified → exit 0 |
| Comment link discovered | manual: `speclaw index` + coverage JSON shows comment origin + nodeId |
| String literal is not a link | by construction (AST comment nodes only) |
| Default needs / missing type defect | unit: missing impl/utest → directDefects |
| Schema bump to 5 | build + index run; `SCHEMA_VERSION = "5"` |
| Coverage CLI / JSON | manual: `node dist/cli/index.js coverage --json` |
| MCP `lawbook_coverage` | contract: registers test |
| Adopt dry-run | unit: `proposeAdopt` |
| Archive gate opt-in | code: `coverageArchiveBlockers` only when delta has ids |
| Dogfood local-content green | manual: 3/3 shallow+deep, 0 defects |

## Pre-existing / unrelated failures

None observed in this run (`npm test`: 283 pass, 0 fail).

## Manual steps not automated

- Full MCP live invoke of `lawbook_coverage` against a running server (contract registration covered).
- Performance budgets (≤250 ms / ≤15 ms) not instrumented in CI yet.

## Verdict

pass — coverage engine, CLI, MCP registration, schema 5, and dogfood capability are green.
