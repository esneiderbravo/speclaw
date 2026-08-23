# Backend — add-bugfix-specs

**Change:** add-bugfix-specs · **Date:** 2026-08-23 · **Branch:** feat/bugfix-specs · **CWD:** /Users/esneiderbravo/Projects/speclaw

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | pass |
| Build | `npm run build` | pass |
| Tests | `npm test` | pass (363 tests, line cov 83.96%) |

## Tests added/updated

- `test/unit/stack-parse.test.ts` — V8/Python traces, dist→src, externals
- `test/unit/bugfix.test.ts` — scaffold, validate, prevention delta
- `test/unit/investigate.test.ts` — no-index, determinism, Java reject
- `test/integration/bugfix-flow.test.ts` — investigate → scaffold
- `test/contract/registers.test.ts` — `lawbook_investigate` in tool list

## Spec-scenario coverage

| Scenario | Verification |
| --- | --- |
| Bug draft produces bugfix artifact | `bugfix.test.ts` scaffold |
| Bug validates without proposal | `bugfix.test.ts` specValidate |
| Missing regression blocks archive | engine gates via validateBugfixContent |
| investigate no-index | `investigate.test.ts` |
| draft --bug / investigate CLI | manual `node dist/cli/index.js lawbook …` |

## Pre-existing failures

None attributable to this change.

## Pending manual

None.

**Verdict:** Backend gates green; bug workflow modules shipped at 0.3.13.
