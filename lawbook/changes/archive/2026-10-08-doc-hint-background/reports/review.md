# Review: doc-hint-background

Discipline: review · change: doc-hint-background (level 3, patch 2.0.21) · branch: fix/doc-hint-background

## Verdict: PASS

## Checks I ran against the diff (/tmp/doc-hint-background.diff)

- **Told only on delivery.** `docHint` (src/modules/lawbook/ship.ts:741-746) returns before `told` is written when the cache misses. `told` is saved only next to the returned hint (ship.ts:758). The no-hint path keeps `prev.told` (ship.ts:753). This meets "A level counts as told only when its hint is returned".
- **Races.** The hook writes `.speclaw/doc-hint.json`. The background job writes only `.speclaw/level-cache.json`. On a cache hit, `measureDiff` returns early and writes nothing, so the two processes never write the same file. If the hook reads a partly written cache, the parse fails, `cachedMeasure` returns null, and the measurement is queued again. That costs time but cannot give a wrong level.
- **Detached spawn.** `CLI_ENTRY` is `../../cli/index.js` relative to `modules/lawbook/ship.js`. Under tsc's preserved layout that resolves to `dist/cli/index.js`, the package `bin`, and to `dist-test/src/cli/index.js` in tests. `spawn` is wrapped in try/catch with an `error` listener and `unref()`, so it never throws or waits. The `pending` record plus `MEASURE_GRACE_MS` stop repeated spawns for the same key. When the worktree has not changed, the early return at ship.ts:730-731 skips `branchFiles` entirely.
- **Hook time budget.** With no cache, the hook runs git status, `branchFiles` and a cache read. With a cache, every `measureDiff` caller (ship.ts:378/392/428/754) returns the cached result, so `gatherSignals` never runs inside the hook.
- **Ship reuse.** `shipChange` uses `measureDiff`, which takes the cached measurement when the file set matches. This meets "One measurement per file set" and is tested in test/integration/ship.test.ts ("ship reuses the cached measurement…").
- **Tests.** All fixtures are tmp repos (`gitFixture`, `tmpRepo`, `bare`); none touch the real checkout. Spec coverage:
  - "A slow diff does not stall the hook": the new background test.
  - "The hint follows the measurement" and "A queued measurement tells nothing": the updated docHint test and the mcp-surface `queued`/`first` calls.
  - "A quoted search pattern is suggested clean": test/unit/check.test.ts.

## Blocking findings

None.

## Non-blocking

1. **Cache key covers less than the measurement depends on** (ship.ts `fileSetKey`). The key hashes only the paths. It leaves out the branch, the merge base, the file contents and the ceremony thresholds. The spec chose this ("per file set"), but if the same files grow a lot before the stop, ship still records the earlier, possibly lower level. Consider adding the branch and the HEAD/worktree diff stat to the key.
2. **Leftover background processes in tests.** The mcp-surface test's `queued` call starts a real detached `measure-diff` and then calls `measureBranchDiff` synchronously. The leftover process can outlive the tmp-dir cleanup. Its errors are swallowed, but it is a stray process during test runs.
3. **Quote stripping can over-strip** (src/modules/foundation/compass-nudge.ts:93). The regex removes every leading and trailing `\'"`, so a pattern that really ends in a backslash loses it. A pattern made only of quotes becomes `""`, and the nudge then suggests an empty `compass_find`. A guard for the empty case is enough.
4. **Possible test flake.** The background test asserts the hook returns in under 2000 ms. That is generous, but it may flake on slow CI.
