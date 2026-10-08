# Performance report — lean-tools (2.1.0)

**Discipline:** performance · **Change:** lean-tools · **Date:** 2026-10-08 · **Branch:**
`feat/lean-tools` · **cwd:** throwaway copies under `/tmp/speclaw-lean/` (harness `run.mjs`,
hidden tests `hidden/`, timing `timing.py`, raw results `results-r1/`, `results-r2/`,
`results/`, review probes `review/`)

## Setup

Real headless agents (`claude -p`, same model and prompt for every config, Spanish like real
tickets, no hint about speclaw) on a fresh copy of this repo at `5884f84` per run — real code.
Three configs ran side by side per task (same machine load):

| Config | What the agent had |
|--------|--------------------|
| **Agent alone** | Plain CLAUDE.md (conventions + "gates must pass"); no lawbook, hooks or MCP |
| **2.0.25** (`main`) | Full install as a user gets it (`speclaw update` + `agent add claude`): hooks, MCP, skills, Compass index |
| **2.1.0** (branch) | Same install from this branch |

The speclaw the hooks and MCP run is a separate immutable build. Quality = a hidden acceptance
test the agent never sees + the full gates after the run.

| Size | Task |
|------|------|
| One line (T0) | Planted bug in `changeNameForBranch` (ticket digits dropped) |
| Medium (T2) | `level` filter for `lawbook_change list`, `specList` and the CLI |
| Large (T3) | `lawbook_change` action `stats` + `speclaw lawbook stats [--json]` + a doctor warning |

## 1. Size matrix (wall = `result.duration_ms`, medians)

| Size | Config | Runs | Wall | Range | vs alone | Cost | Turns | Peak context | Hidden tests | Gates |
|------|--------|------|------|-------|----------|------|-------|--------------|--------------|-------|
| One line | Agent alone | 4 | 76 s | 67–94 | 1.00× | $0.15 | 6 | 23k | 4/4 | 4/4 |
| One line | 2.0.25 | 4 | 83 s | 72–97 | 1.09× | $0.28 | 8 | 36k | 4/4 | 4/4 |
| One line | 2.1.0 first build | 2 | 144 s | 133–156 | 1.89× | $0.30 | 8 | 36k | 2/2 | 2/2 |
| One line | **2.1.0 final** | 2 | **82 s** | 79–85 | **1.08×** | $0.26 | 7 | 35k | 2/2 | 2/2 |
| Medium | Agent alone | 4 | 157 s | 144–168 | 1.00× | $0.54 | 17 | 45k | 12/12 | 4/4 |
| Medium | 2.0.25 | 4 | 157 s | 154–160 | 1.00× | $0.71 | 20 | 58k | 12/12 | 4/4 |
| Medium | **2.1.0 final** | 3 | **160 s** | 140–171 | **1.02×** | $0.70 | 20 | 57k | 9/9 | 3/3 |
| Large | Agent alone | 4 | 199 s | 171–231 | 1.00× | $0.84 | 22 | 63k | 12/12 | 4/4 |
| Large | 2.0.25 | 4 | 159 s | 144–181 | 0.80× | $0.98 | 25 | 75k | 12/12 | 4/4 |
| Large | **2.1.0 final** | 3 | **145 s** | 141–150 | **0.73×** | $0.91 | 24 | 70k | 9/9 | 3/3 |

Every run of every config solved its task: 66/66 hidden tests, 33/33 runs with green gates.

## 2. Where the time goes (seconds, medians, round 2)

| Size | Config | Wall | Model | Agent's own test runs | Stop hook | of it: check / build / tests |
|------|--------|------|-------|-----------------------|-----------|------------------------------|
| One line | alone | 76 | 13 | **57** | — | — |
| One line | 2.0.25 | 83 | 19 | 10 | 43 | 6 / 2 / 33 |
| One line | 2.1.0 | 82 | 18 | 12 | 45 | 7 / 2 / 34 |
| Medium | alone | 148 | 44 | **80** | — | — |
| Medium | 2.1.0 | 166 | 50 | 31 | 39 | 5 / 2 / 30 |
| Large | alone | 223 | 63 | **116** | — | — |
| Large | 2.1.0 | 147 | 62 | 7 | 30 | 5 / 4 / 19 |

Tests are the cost. Alone, the agent runs the suite itself (57–116 s). With speclaw it runs one
or a few files and the stop runs the tests the diff reaches (19–34 s). The stop's own overhead
(scaffold, measure, report, archive) is ~2–3 s.

Measured in isolation on the one-line fixture, the stop costs ~36 s: lint 5.1 s, build 1.8 s,
test compile 2.6 s, tests 26 s — of which `ship.test.ts` alone, the one test that covers the
change, is 21.7 s. Selecting tests by symbol instead of by file would save ~5 s: the floor is the
project's own slow test, not the selection.

## 3. Review (Cortex reviewer, `--scenario review`)

Planted defects: stub `design.md`, a test writing the repo's real data, no red-first evidence.

| Reviewer | Defects caught | Clean change passed | Time (median) | Cost (median) | Tool calls |
|----------|----------------|---------------------|---------------|---------------|-----------|
| 2.0.25 | 9/9 | 2/3 (one false FAIL) | 66.6 s planted · 80.1 s clean | $0.43 · $0.49 | 5–9 |
| **2.1.0** | **9/9** | **3/3** | **34.6 s** planted · **54.2 s** clean | **$0.30** · **$0.41** | 3–9 |

The first "clean" probe was not clean: its rounding fix returned `NaN` for amounts printed in
exponent form and its `tasks.md` missed the mandatory steps. Every reviewer of both versions
failed it with `money.js:3` and a reproduction — a real catch. The fixture was fixed and the
clean probe re-run (table above).

## 4. Changes made from these measurements

| Finding | Change | Effect |
|---------|--------|--------|
| The `compass_diff_context` hint after a passing test run fired in 4/6 sessions, was never followed, and made agents rerun whole test files | Removed | One line: 144 s → 82 s (back to 2.0.25) |
| The stop re-ran tests the agent had just passed | Reuse a green run of the same files after the last edit, with the same compile step and no filter; the report cites it | Saves the re-run when it applies (~22 s on the one-line task in round 1). In round 3 agents filtered by test name or edited after testing, so it did not apply — correctly |
| `lawbook_investigate` hint on a failing test | Kept | Fired once, on an intentional red-first run; not followed. Harmless (< 1 ms, once per signature) |

## 5. Verdict

- **Time:** 2.1.0 is at parity with the agent alone on one-line and medium changes (1.08×,
  1.02×) and faster on the large one (0.73×), and never slower than 2.0.25 beyond noise.
- **Quality:** unchanged — 100 % hidden tests and gates in every config; the reviewer catches
  every planted defect and stops failing clean changes.
- **Review:** about 2× faster and 30 % cheaper than 2.0.25.
- **Breaking:** the 20 retired tool names stop working; `doctor` and `speclaw update` guide it.

## Pre-existing / unrelated failures

none

## Pending manual steps

none
