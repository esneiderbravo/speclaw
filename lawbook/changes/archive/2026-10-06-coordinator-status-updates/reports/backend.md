# Backend checks — coordinator-status-updates (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · cwd `/Users/esneiderbravo/Projects/speclaw`; manual checks in throwaway repo `/tmp/csu-mv.mg5yyg` with the built CLI.

Scope: `src/modules/cortex/status.ts` (new): `countTaskCheckboxes`, `readStatusIntervalMinutes`, `buildStatusSummary`, `fitStatusResult`. Also `harness.ts` (`status` returns `{summary, state}`), `brief.ts` (type import moved to the leaf `types.ts`, which removes a cycle), and the `change-tool.ts` alias fitting.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0, "All matched files use Prettier code style!", ESLint clean |
| Type-check + build | `npm run build` | ✅ exit 0, "copy-assets: copied assets for 3 module(s)" |
| Tests + coverage | `npm test` | ✅ tests 685, pass 685, fail 0; all files 86.11 / 82.82 / 88.00 (line/branch/funcs, floor 80). `cortex/status.js` 100 / 100 / 100. `cortex/harness.js` 89.75 / 80.23 / 100. `lawbook/change-tool.js` 77.86 / 68.42 / 100 (file below the floor, but the floor is enforced on all files, which pass; the uncovered lines 82-114 and 128 are pre-existing level/coverage branches, not this diff) |
| Validate | `lawbook_change` `validate` | ✅ `valid: true`, `issues: []` |
| Coverage (reqs) | `node dist/cli/index.js coverage --only-defects` | ✅ "ok - 35 total" (canonical only). The new ids are verified post-sync by the archiver |

## Tests added / updated

- `test/unit/cortex-status.test.ts` (new, temp dirs only) covers:
  - `countTaskCheckboxes`: mixed `[ ]`, `[x]`, `[X]`, `*` bullets; non-list brackets ignored;
  - summary fields from a seeded harness + `tasks.md`;
  - the `record.md` fallback, and `null` when neither file exists;
  - `pendingVerdicts` by level, with PASS removed;
  - elapsed time with an injected `now`: `null` without a parseable start, never negative;
  - the `questions` suffix;
  - the interval matrix;
  - the configured interval inside the summary;
  - `summary: null` without a harness;
  - `fitStatusResult` for a small result, the long history (30 entries), and `stateOmitted`.
- `test/unit/harness.test.ts`: the `status` shape is updated.
- All named tests passed in the full run (log lines 269–280).

## Manual verification (built CLI, throwaway repo)

- **Checkbox counting with nesting.** This `tasks.md` gave `{"done":3,"total":6}`:
  ```
  - [x] 1.1 / - [ ] 1.2 / "  - [x] 1.2.1" / "  - [ ] 1.2.2" / "    * [X] 1.2.2.1" / - [ ] 1.3
  Not a task: [x] inline bracket
  1. [x] numbered (not counted by design)
  ```
  Ticking 1.3 changed it to `4/6`. With no `tasks.md`, the result was `tasks n/a` / `null`.
- **Elapsed time.** I backdated the stage's history entry by 12 minutes in the throwaway harness and got `elapsedMinutes: 12`. A fresh stage gave `0`.
- **Rework and verdicts.**
  - A review FAIL gave `rework 1/3`, back in implementing, with `pendingVerdicts ["review","test"]`.
  - After review PASS and test PASS, the `done` stage showed `pending: none` and `role: null`.
- **Interval** (`cortex:\n  statusIntervalMinutes: <v>` appended to the init config):
  ```
  absent -> 5
  [0] -> 0     [5] -> 5     [59] -> 59   [60] -> 60   [61] -> 60   [1440] -> 60
  [-1] -> 5    [abc] -> 5   [2.5] -> 5   ["7"] -> 7   [8  # comment] -> 8   [] -> 5
  flow style -> 5   commented block -> 5   key under other block -> 5   missing file -> 5
  ```
  No run raised an error.
- **Purity.** `status` is read-only: `harness.json` was unchanged (hash checked) on the MCP run and on this repo's own change. On this repo, `cortex status --change coordinator-status-updates` gave `interval 5`, `history 9`, and the line `coordinator-status-updates · testing (tester) · 3m in stage · tasks 21/25 · rework 1/3 · pending: test`.
- **Module boundary.** `status.ts` imports only `brief`, `compass-gate`, `types`, and `shared/output-budget`, with no lawbook import (D11). The reviewer confirmed this with Compass, and `npm run build` raised no cycle complaint.

Isolation: every write went to `mkdtemp` repos. Nothing was written to this repo's data.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| Status returns the summary for a running change | unit "summary reports role, elapsed, tasks, rework and pending verdicts"; manual implementing run |
| Level 0 owes only the test verdict and counts record.md | unit "level 0 owes only test and counts record.md when tasks.md is absent" |
| Questions stage says the human owes answers | unit "questions stage says the human owes answers"; manual |
| A long history keeps the summary on the MCP path | unit "MCP cortex status keeps the full summary…"; manual MCP run (see `api.md`) |
| No harness gives a null summary | unit "handleHarness status returns a null summary without a harness"; manual |
| CLI prints the line on stderr unless --json | integration test; manual (see `api.md`) |
| Absent key defaults to 5 | unit "status interval reads … with a safe default"; manual |
| Configured value is reported | unit "summary reports the configured interval"; manual |
| Zero disables updates | unit; manual `0` → 0 |
| Invalid values fall back to 5 | unit; manual matrix |
| Values above 60 are capped at 60 | unit; manual `61`/`1440` → 60 |
| The load step sets up the timer from the summary | `skills.md` |
| The dispatch loop posts updates in the session language | `skills.md` |
| Completion deletes the timer | `skills.md` |

## Pre-existing / unrelated failures

None in the gates.
- Repeating `--question` on the CLI keeps only the last value. This is pre-existing and not in this diff; see `api.md`.
- The Compass index is slightly stale for `status.ts`: `compass_explore` source offsets begin about 10 lines early because the file was edited after the last index. This is cosmetic for this verification. I did not reindex, to avoid rewriting `docs/compass.md`.
- Reviewer follow-ups m8 (harness level sync) and n1/n2 stay open and do not block.

## Pending manual steps

None.

## Verdict

PASS
