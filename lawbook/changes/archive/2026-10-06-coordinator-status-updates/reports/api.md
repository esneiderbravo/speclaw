# API checks — coordinator-status-updates (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · cwd `/Users/esneiderbravo/Projects/speclaw` (gates); manual exercise in throwaway repos `/tmp/csu-mv.mg5yyg` (CLI) and `$TMPDIR/csu-mcp-CFrfuY` (MCP), built CLI `dist/cli/index.js`.

## Contract under test

### MCP tool `cortex`, action `status`

- **Input schema: unchanged.** `{ projectPath: string, change: string, action: enum(status|start|advance|rework|brief), note?, verdict?: PASS|FAIL, openQuestions?: string[], pauseForQuestions?: boolean }`. `git diff src/modules/cortex/register.ts` shows only the description going from "status, start, …" to "status with summary, start, …". `change` stays required, and there is no all-changes mode (D5). `mcp-budget` and `contract/registers` are green.
- **Auth / permissions:** local stdio MCP with no auth. `status` is read-only: `harness.json` was byte-identical before and after (sha256 checked on the MCP run and shasum checked on this repo's own change).
- **Result** (text content, pretty JSON). Key order is part of the contract: `summary` comes first (D12).
  - With a harness: `{ summary: CortexStatusSummary, historyOmitted?: number, state: HarnessState | null, stateOmitted?: true }`.
  - `CortexStatusSummary` = `{ change, stage, role: string|null, stageStartedAt: string|null, elapsedMinutes: number|null, tasks: {done,total}|null, iteration, maxRework, pendingVerdicts: ("review"|"test")[], openQuestions: number, statusIntervalMinutes: number, line: string }`.
  - No `harness.json`: `{ "summary": null, "state": null }`.
  - Unknown change: the handler throws `change "<name>" not found under lawbook/changes/`, which the MCP SDK returns as a tool error. This behavior is unchanged.
- **Budget fitting (MCP only):** the result is kept within `OUTPUT_BUDGET.brief` (1500 tokens), so `text()` never truncates it. When it would not fit, the oldest `state.history` entries are dropped (newest kept) and their count goes in `historyOmitted`. If an empty history still does not fit, the result is `state: null, stateOmitted: true`. `historyOmitted` is absent when nothing was dropped.
- **Deprecated alias** `lawbook_change` action `harness`, `harnessOp: status`: same result, fitted the same way.

### CLI `speclaw cortex status --change <name> [--json]`

| Case | stdout | stderr | exit |
|------|--------|--------|------|
| running harness | one JSON document `{summary, state}` (full history, not fitted) | `  <summary.line>` | 0 |
| running harness, `--json` | same JSON | empty | 0 |
| change without `harness.json` | `{"summary": null, "state": null}` | empty | 0 |
| unknown change | empty | `✗ change "nope" not found under lawbook/changes/` | 1 |
| alias `speclaw lawbook harness status` | `{summary, state}` | empty (no line) | 0 |

There is no ordering guarantee beyond the key order above. Each `status` call is a fresh read of `harness.json`, `tasks.md`/`record.md`, and `lawbook/config.yaml`.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ "All matched files use Prettier code style!", ESLint clean, exit 0 |
| Type-check + build | `npm run build` | ✅ `tsc` clean, "copy-assets: copied assets for 3 module(s)", exit 0 |
| Tests + coverage | `npm test` | ✅ tests 685, pass 685, fail 0, cancelled 0, skipped 0; all files 86.11% line / 82.82% branch / 88.00% funcs (floor 80); `cortex/status.js` 100/100/100; `cortex/register.js` 100/100/100 |
| Change validation | `lawbook_change` action `validate`, change `coordinator-status-updates` | ✅ `valid: true`, `issues: []` (EARS style warnings only) |
| Requirement coverage | `node dist/cli/index.js coverage --only-defects` | ✅ "ok - 35 total", exit 0, canonical specs only. The new ids are not visible before sync, so the archiver verifies them after sync. The `Covers:` tags are present: impl `status.ts:85,143,214`; tests `cortex-status.test.ts:58,164,216`, `cortex-status-cli.test.ts:15`, `cortex-skill-status.test.ts` ×7 |
| Contract/budget | in `npm test`: `test/unit/mcp-budget.test.ts`, `test/contract/registers.test.ts`, "full profile registers exactly nine canonical MCP tools" | ✅ pass |

## Manual exercise (real output)

**CLI** (throwaway repo: `git init` → `speclaw init` → `lawbook draft demo --level 2` → `cortex start`):

- No harness: exit 0, stdout `{"summary": null, "state": null}`, stderr `[]`.
- Unknown change: exit 1, stdout `[]`, stderr `✗ change "nope" not found under lawbook/changes/`.
- Exploring, no `tasks.md`: exit 0, keys `[ 'summary', 'state' ]`, stderr `demo · exploring (explorer) · 0m in stage · tasks n/a · rework 0/3 · pending: review, test`.
- Questions: stderr `demo · questions (planner) · 0m in stage · tasks n/a · rework 0/3 · pending: review, test · waiting on human: 1 question(s)`.
- Stage start backdated 12 minutes in the throwaway harness, with `--json`: stderr `[]`, `elapsedMinutes` 12, line `… · 12m in stage · tasks 3/6 · …`.
- Implementing after a review FAIL: `demo · implementing (implementer) · 0m in stage · tasks 3/6 · rework 1/3 · pending: review, test`. After ticking one task: `tasks 4/6`.
- Done: `demo · done · 0m in stage · tasks 4/6 · rework 1/3 · pending: none`, with `role: null` and `pendingVerdicts: []`.
- Alias `lawbook harness status`: exit 0, stderr `[]`, keys `summary,state`.

**MCP** (script `/tmp/csu-mcp/run.mjs`): it imports `dist/modules/cortex/register.js` and `dist/modules/lawbook/register.js`, captures the real handlers through a stub `registerTool`, and calls them. The harness has 40 history entries with about 340-character notes, stage `questions`, 2 open questions, and `statusIntervalMinutes: 7 # team pref`.

```
budget tokens 1500 unfitted est tokens 4924
--- cortex: len=5682 tokens=1421 truncatedMarker=false
 keys: summary,historyOmitted,state
 summary: {"change":"long","stage":"questions","role":"planner",…,"elapsedMinutes":141,"tasks":{"done":2,"total":3},"iteration":2,"maxRework":3,"pendingVerdicts":["review","test"],"openQuestions":2,"statusIntervalMinutes":7,"line":"long · questions (planner) · 141m in stage · tasks 2/3 · rework 2/3 · pending: review, test · waiting on human: 2 question(s)"}
 historyOmitted: 30 kept: 10 sum: 40 newestKept: true
--- lawbook_change: len=5682 tokens=1421 truncatedMarker=false
 keys: summary,historyOmitted,state
 historyOmitted: 30 kept: 10 sum: 40 newestKept: true
--- no harness: { "summary": null, "state": null }
--- unknown threw: change "nope" not found under lawbook/changes/
harness.json untouched: true history on disk: 40
```

**Isolation:** every write went to a `mkdtemp` throwaway repo. The only command run against this repo was `cortex status` on this change, which is read-only, and `harness.json` was confirmed unchanged. No `init` or `update` was run here, and `docs/compass.md` is unchanged. No live data store is involved.

## Tests added / updated

- `test/integration/cortex-status-cli.test.ts`: the stderr line plus the stdout JSON with `summary`; `--json` suppresses the line; no harness gives `{state:null, summary:null}` with empty stderr; an unknown change exits 1.
- `test/unit/cortex-status.test.ts`: "MCP cortex status keeps the full summary and valid JSON on a long history" (captured handler and the real `text()`, alias included); `fitStatusResult` small-result and `stateOmitted` cases; "handleHarness status returns a null summary without a harness".
- `test/unit/harness.test.ts`: updated for the `{summary, state}` shape.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| Status returns the summary for a running change | unit "summary reports role, elapsed, tasks, rework and pending verdicts"; manual CLI implementing (12m, 3/6, rework, pending) |
| Level 0 owes only the test verdict and counts record.md | unit "level 0 owes only test and counts record.md when tasks.md is absent" |
| Questions stage says the human owes answers | unit "questions stage says the human owes answers"; manual CLI + MCP (`waiting on human: 2 question(s)`) |
| A long history keeps the summary on the MCP path | unit "MCP cortex status keeps the full summary…"; manual MCP run (40 entries) |
| No harness gives a null summary | unit + integration; manual CLI and MCP |
| CLI prints the line on stderr unless --json | integration "cortex status prints the summary line…"; manual CLI |
| Absent key defaults to 5 | unit; manual (init config, no `cortex:` → 5) |
| Configured value is reported | unit "summary reports the configured interval"; manual (5, 59, 60, `"7"`, `8 # comment`, MCP `7`) |
| Zero disables updates | unit; manual `0` → 0 |
| Invalid values fall back to 5 | unit; manual `-1`, `abc`, `2.5`, empty, flow style, missing file → 5 |
| Values above 60 are capped at 60 | unit; manual `61`, `1440` → 60 |
| The load step sets up the timer from the summary | see `skills.md` |
| The dispatch loop posts updates in the session language | see `skills.md` |
| Completion deletes the timer | see `skills.md` |

## Pre-existing / unrelated failures

None among the gates. Unrelated observation: repeating `--question` on `speclaw cortex advance` keeps only the last value. I passed two questions and `openQuestions` stored `["Keep v1 API?"]`. `src/cli/commands/cortex.ts` `list(flags.question)` is untouched by this diff (the only hunk is the stderr line), so this is pre-existing flag-parser behavior. The 2-question count was verified on the MCP path instead.

## Pending manual steps

None for the contract.

## Verdict

PASS
