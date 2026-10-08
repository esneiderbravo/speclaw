# Tasks — tool-arg-friction

## 0. Branch

- [x] 0.1 Create the branch `fix/tool-arg-friction`

## 1. Implementation

- [x] 1.1 Default the archive date to today; let archive and level-0 ship skip the unsynced-delta blocker because they sync
- [x] 1.2 Infer the target change (`name`, only active change, branch's change) and list the active changes when none fits
- [x] 1.3 Read `create`/`new` as draft and separated `paths`/`symbols` strings as lists
- [x] 1.4 Answer `compass_explore` with `query` and no `node` as a find
- [x] 1.5 Name the next step when `cortex` targets an undrafted change
- [x] 1.6 Relax the `lawbook_archive`, `lawbook_validate` and `lawbook_sync` alias schemas; update the archive command doc
- [x] 1.7 Scope the Stop hook's test gate to the tests the diff reaches, with full-suite fallbacks and `ship.tests: full`
- [x] 1.8 Measure a small fix (≤ 1 source file, ≤ 10 lines) at level 0
- [x] 1.9 Make the gate instructions in CLAUDE/AGENTS/testing-standards (templates + repo copies) agree with the hook; document `ship.tests` in `docs/cortex.md`

## 2. Verification

- [x] 2.1 Add `test/integration/tool-args.test.ts` (each failed call, through the real MCP client); update the explore contract test; ship tests for small-fix level 0 and the scoped / full / no-index test gate
- [x] 2.2 Run the quality gates (`npm run check`, `npm run build`, `npm test`: 1057/1057)
- [x] 2.3 Benchmark main vs branch (`scripts/bench/tool-args.mjs`: replay of the real failed calls, well-formed latency N=50, headless agent N=3) → `reports/performance.md`
- [x] 2.4 Real agent runs by size (agent alone vs speclaw before/after) → `reports/agent-runs.md`
- [x] 2.5 Discipline reports under reports/ (written by ship from the gates)
- [x] 2.6 Archive the change within the same PR
