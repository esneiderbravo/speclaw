# Cortex speed benchmark

**Date:** 2026-10-07 · **Agent:** Claude Code headless (`claude -p`) · **Script:** `scripts/bench-workflow.sh`

Every run is a real agent fixing real bugs in a throwaway git fixture under
`/tmp`; every run's tests pass afterwards. "Process" is wall-clock from launch
to exit (includes ~3–5 s CLI start-up and the `Stop` hook); "calls" are agent
tool calls. Runs of one table were launched in the same time window.

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
