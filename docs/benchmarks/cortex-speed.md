# Cortex speed benchmark

**Date:** 2026-10-07 · **Agent:** Claude Code headless (`claude -p`) · **Script:** `scripts/bench-workflow.sh`

Every run is a real agent fixing real bugs in a throwaway git fixture under
`/tmp`; every run's tests pass afterwards. "Process" is wall-clock from launch
to exit (includes ~3–5 s CLI start-up and the `Stop` hook); "calls" are agent
tool calls. Runs of one table were launched in the same time window.

## 2.0.20 vs 2.0.19 vs an agent alone, per level and on a code-graph task

**Date:** 2026-10-08. `scripts/bench-workflow.sh 3 <A|B> <scenario>`, 45 runs:
per scenario the three modes ran back to back (2.0.19 from a `main` worktree
build via `SPECLAW_DIST`). Fixtures come from `scripts/bench-fixture.mjs`:
`one`…`wide` are sized so the reference fix measures levels 0–3; `deep` is a
132-file repo whose rounding bug sits five calls below the failing test among
dozens of look-alike helpers. Every run fixed the bugs and left the tests
passing. Medians of 3: agent seconds (model `duration_ms`), process seconds
(wall-clock with CLI start-up and the `Stop` hook), cost, and tokens (input +
cache + output). Tool calls come from the session transcripts. Until this date
the script's Cortex fixture never installed the `Stop` hook (`init --minimal`
configures no IDE folder since 2.0.16; it now runs `speclaw agent add claude`).

| Scenario | Agent alone | 2.0.19 | 2.0.20 |
|---|---|---|---|
| L0 — one-line bug | 11.8 s · 14.4 s · $0.185 · 118k tok · 4 turns | 12.1 s · 20.1 s · $0.203 · 130k · 4 | 14.9 s · 18.2 s · $0.207 · 135k · 4 |
| L1 — bug across 2 modules | 12.8 s · 15.5 s · $0.195 · 120k · 4 | 14.2 s · 17.1 s · $0.211 · 131k · 4 | 28.5 s · 31.9 s · $0.293 · 282k · 8 |
| L2 — 5 modules + public entry | 13.5 s · 16.1 s · $0.200 · 121k · 4 | 13.1 s · 16.3 s · $0.216 · 132k · 4 | 27.6 s · 30.8 s · $0.276 · 214k · 6 |
| L3 — 16 modules + entry + `package.json` | 16.1 s · 18.8 s · $0.224 · 126k · 4 | 20.5 s · 23.5 s · $0.248 · 139k · 4 | 29.7 s · 33.1 s · $0.304 · 225k · 6 |
| deep — bug 5 calls down, 132 files | 30.5 s · 33.2 s · $0.254 · 229k · 7 | 22.4 s · 25.2 s · $0.253 · 175k · 5 | 23.2 s · 26.5 s · $0.268 · 182k · 7 |

The 2.0.20 column is the final build (in-turn documentation hint, nudge
silent under 40 indexed files); the other two columns are from the same day's
45-run batch. Run-to-run spread is wide: the same 2.0.20 L0 path measured
11.0 s and the deep scenario 16.7 s in that batch.

What each 2.0.20 run left in `lawbook/changes/` besides the fix (2.0.19
archived every scenario at level 0 with a file-list record and a report):

| Level | Artifacts |
|---|---|
| L0, deep | archived: record, report (level 0 never waits) |
| L1 | record with why, checked tasks, delta spec, report; waits for PR review |
| L2 | proposal, checked tasks, delta spec, report; waits for PR review |
| L3 | proposal, design, checked tasks, delta spec, report; waits for PR review |

The documentation hint reached all 9 L1–L3 runs and none was blocked at the
stop: the agent wrote what its level owed in the same turn.

Tool use (all 3 runs of a cell; reads are Read/Grep/Glob or shell
`cat`/`sed`/`grep`/… per run, median):

| Scenario | 2.0.19 | 2.0.20 |
|---|---|---|
| deep | Compass in 1 of 3 runs, after a tool-search turn; 4 reads | `compass_explore` ×5 and `lawbook_investigate` ×1, no tool search; 4 reads |
| L1 | `compass_explore` ×2 | `compass_explore` ×2, `compass_find` ×2, `lawbook_investigate` ×1 |
| L0, L2, L3 | `compass_explore` ×0–2 | `compass_explore`/`compass_find` ×0–1 |

Against an agent alone, 2.0.20 is faster on the code-graph task (−24 % agent
time, −20 % tokens) and costs about +3 s at L0 and +14–16 s with +$0.08–0.10
at L1–L3, where the agent writes the documentation those levels owe. The hook
itself (`speclaw ship-on-stop`, gates included, no agent) takes 0.5–0.8 s, and
the per-call `PostToolUse` documentation check about 17 ms.

## New Cortex (one brain on the critical path, `Stop` hook ships)

| Mode | Process per run | Median | Calls | Cost | Archived with report |
|---|---|---|---|---|---|
| Agent alone — 1 bug | 16.6 / 15.0 / 15.8 s | **15.8 s** | 3 | $0.17 | — |
| **Cortex — 1 bug** | 18.1 / 17.0 / 19.8 s | **18.1 s** | **3** | $0.22 | 3/3 |
| Cortex — 1 bug, prompt "follow the workflow through archive" | 23.4 / 28.0 / 28.9 s | 28.0 s | 5–6 | $0.26 | 3/3 |
| Agent alone — 3 bugs, 3 files | 16.5 / 15.1 s | 15.8 s | 2–3 | $0.18 | — |
| Cortex — 3 bugs, prompt "follow the workflow through archive" | 28.3 / 26.0 s | 27.2 s | 6–7 | $0.28 | 2/2 |

speclaw's own work in the hook (record, gates, report, harness, archive):
**0.10–0.31 s** plus the project's gates.

## Previous Cortex (serial role agents), same 1-bug task

| Run | Model time | Calls | Cost |
|---|---|---|---|
| 1 | 153.9 s | 16 turns | $1.02 |
| 2 | 74.5 s | 14 calls | $0.52 |

Its time went to discovering the ritual (reading LAWS.md, config, standards,
`--help`), stepping the harness by hand, and retrying archive — only 3 of 14
calls were the fix itself. On a real level-3 bug in this repo the previous
flow took 151.7 minutes of stage time before testing finished.

## Why multi-agent is not the default

Measured on the 3-bug task: three parallel subagents took 33–48 s of model
time at $0.65–0.70 (≈4× cost, no speed gain); a blocking background reviewer
added 30–70 s of waiting. Extra agents now run only for three or more large,
independent parts, in parallel, and review happens on the PR.

## Feature-sized task: orders module for a shop service

`FEATURE.md` asks for a full orders module on an HTTP service: four REST
endpoints, validation (400), unknown product (404), stock conflicts (409),
all-or-nothing stock changes, 19% tax with 2-decimal rounding, per-user
listing newest first, cancel with stock restore, and tests. Quality is graded
by **7 hidden acceptance tests** no agent saw. Same prompt for every mode; runs
launched together. Budget rule: Cortex may take at most **2×** the agent alone.

| Mode | Process | Cost | Calls | Subagents | Own tests | Hidden acceptance | Archived | Within 2× |
|---|---|---|---|---|---|---|---|---|
| Agent alone #1 | 1.2 min | $0.39 | 4 | 0 | 17/17 | 7/7 | — | — |
| Agent alone #2 | 1.2 min | $0.39 | 4 | 0 | 16/16 | 7/7 | — | — |
| **New Cortex #1** | **1.5 min** | $0.60 | 10 | 0 | 17/17 | **7/7** | yes | **yes (1.25×)** |
| **New Cortex #2** | **1.6 min** | $0.57 | 10 | 0 | 19/19 | **7/7** | yes | **yes (1.33×)** |
| Previous Cortex (2.0.12) | 13.2 min | $4.45 | 164 | 6 | 43/43 | 7/7 | yes | no (11×) |

Limit = 2 × 1.2 min = 2.4 min. All modes reached the same hidden-acceptance
quality; the previous Cortex spent 11× the time and cost on serial role agents.
