# Backend checks — doc-hint-background (2026-10-08)

2026-10-08 · `fix/doc-hint-background` · `/Users/esneiderbravo/Projects/speclaw` (macOS, Node 24.17.0)

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Format + lint | `npm run check` | ✅ exit 0 |
| Type-check + build | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ 1044 tests, 1044 passed, 0 failed; lines 89.33 %, branches 84.95 %, functions 91.48 % |
| Change artifacts | `node dist/cli/index.js lawbook validate doc-hint-background` | ✅ valid, 2 delta specs |

## Tests added / updated

- `test/integration/ship.test.ts`: "the edit hook's background job measures the diff without the
  hook waiting" (real detached `measure-diff`, polls for the cache, hook call < 2 s); "ship reuses
  the cached measurement of the same file set"; the `docHint` test now expects no hint until the
  file set is measured.
- `test/integration/mcp-surface.test.ts`: the doc-group call returns no context while unmeasured,
  then the hint after `measureBranchDiff`.
- `test/unit/check.test.ts`: "a quoted or escaped shell search pattern reaches the nudge clean".

## Regression tests failing first

| Fix | Before | After |
|-----|--------|-------|
| Nudge pattern quotes | `not ok 1 — a quoted or escaped shell search pattern …` | `ok` |
| Background measurement, cache reuse | The 2.0.20 code has no `measureBranchDiff`/cache; the failure it fixes was observed live: 12,928 ms hook call (> 5 s timeout) on the ftd clone, 2 `hook_cancelled` events in the real session | ~35 ms per call, hint delivered (see `performance.md`) |

## Spec scenario coverage

| Scenario | Verified by |
|----------|-------------|
| ship: The hint arrives before the stop | `docHint tells a level 1+ change …` |
| ship: Written in the same turn, the stop is not blocked | same test |
| ship: A slow diff does not stall the hook | `the edit hook's background job measures the diff without the hook waiting` |
| ship: The hint follows the measurement | same test, and `docHint tells …` |
| ship: The stop reuses the edit hook's measurement | `ship reuses the cached measurement of the same file set` |
| ship: A queued measurement tells nothing | `docHint tells …` (null while queued, hint after) |
| compass: A quoted search pattern is suggested clean | `a quoted or escaped shell search pattern reaches the nudge clean` |
| All other `ship` / `compass` scenarios | unchanged; covered as in `2026-10-08-ship-measures-level/reports/backend.md` |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Manual verification ran on a `git clone --local` of ftd-admin-finanzas under `/tmp` with
its 47 uncommitted files copied in (read-only on the original); the real project was not written.

## Verdict

✅ PASS — gates green, new scenarios tested, live failure reproduced and fixed.
