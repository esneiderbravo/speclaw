# Review — tool-arg-friction

Verdict: **PASS**

Scope: /tmp/tool-arg-friction.diff against proposal.md and delta specs (tool-arguments, ship).
Gates were not re-run (the coordinator reported check/build/test as passing, 1057/1057).

## Blocking findings

None.

## Checked, no defect

1. Inference: `resolveActiveChange` (src/modules/lawbook/ship.ts, around line 945) returns a name only when exactly one change fits. If there are none, or the match is ambiguous, `targetChange` (src/modules/lawbook/change-tool.ts:103-114) raises an error that lists the active changes. Archive and sync still go through every precondition.
2. Scoped tests: `scopedTestGate` (ship.ts:155-177) falls back to the full suite when there is no index, a global file is touched (`mode: "all"`), changed code reaches no test, or anything throws. A failing scoped command still breaks the loop and fails the gate (`shipChange`, ship.ts:725-738).
3. Small fix: `measureDiff` (ship.ts:372-384) returns early on public API or global file. More than one source file returns null, so a rename (two paths) is never a small fix. Untracked files are counted by their line count.
4. `{ syncing: true }` (src/modules/lawbook/engine.ts:544) skips only the unsynced-delta loop. Tasks, reports, bugfix, coverage and harness blockers still apply. `specArchive` syncs the specs itself (engine.ts:612-620).
5. Schemas: `node` was made optional and `name`, `looseList`, the action synonyms and the optional alias fields were added. Every call that was valid before still parses. A level call with no mode already threw in `handleLevel` (src/modules/lawbook/quick.ts:100).
6. Tests use `tmpRepo`/`gitFixture` temp dirs only. Nothing touches the real checkout.
7. The templates (CLAUDE/AGENTS/testing-standards) still tell agents without a Stop hook to run the gates themselves or run `speclaw ship`.

## Non-blocking

- `shipChange` (ship.ts:~732): if the diff is empty or docs-only, the test gate is recorded as `pass` with 0 ms. The scope column says so, but a "skipped" label would read better than "pass".
- `smallFix` (ship.ts:~400-406): for a binary or mode-only change, numstat gives `-\t-` and counts as 0 lines, so the change can measure as level 0. Treat a non-numeric numstat as "not small".
- `smallFix` (ship.ts:~397): a diff with only tests/docs returns `{files:0}`, so it is level 0 whatever its size. The spec intends this, but a large test-only rewrite now carries no ceremony.
- `resolveActiveChange`: if there is a single active change, it is chosen even when the branch name does not match it. For `archive`, consider requiring a branch match or an explicit `change`.
- `scopedTestGate`: the scoped `at.command` skips the project's own `test` script, including any pre-steps chained inside it. Note this in docs/cortex.md.
