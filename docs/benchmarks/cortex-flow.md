# Cortex flow benchmark

**Script:** `scripts/bench/cortex-flow.mjs` (fixtures in
`scripts/bench/cortex-flow-fixtures.mjs`) · **Agent:** any headless agent CLI,
Claude Code (`claude -p`) by default.

[`cortex-speed.md`](cortex-speed.md) measures one-line bugs. This benchmark
measures the two cases where Cortex does more than one agent would: a
level 2–3 change taken through the whole lane, and work that fans out to
parallel agents. No results are recorded yet; add a dated section below after
each real run.

## Scenarios

| Scenario | Mode | What runs |
|---|---|---|
| `full` | A | One agent, no speclaw, implements `FEATURE.md`: coupons across a new module, cart, orders, the public entry and `package.json`. The reference solution measures level 2 under `ship-on-stop`. |
| `full` | B | The same task through the complete Cortex lane: implement → the level's docs → review (`reports/review.md`) → test (discipline reports) → archive (`lawbook_change` action `archive`). |
| `full` | R | Review probe: a bug change (`fix-ledger-rounding`, level 2) already built on its branch with planted process defects; a Cortex reviewer reviews it. |
| `full` | control | `--control` only: the same probe with no defects; the review should PASS. |
| `fanout` | A | One agent builds three large independent modules (CSV, durations, SemVer ranges). |
| `fanout` | F | The same task through the Cortex fan-out lane (one agent per part, in parallel). |

Planted defects (`--defects`, default `stub,real-data,red-first`):

| Defect | What is planted |
|---|---|
| `stub` | `design.md` is still the scaffold placeholder while every task is checked. |
| `real-data` | The regression test loads, appends to and saves the repo's own `data/ledger.json` instead of a temp copy. |
| `missing-report` | `reports/` holds only `README.md`. |
| `red-first` | The bug's report has no output of the regression test failing before the fix. |

A defect counts as caught when one finding in `review.md` (or the agent's
final message) names it: the file and the problem in the same paragraph or list
item. The matched excerpt is kept in `results.json` so a person can audit each
call.

## What is recorded

Per run: process wall-clock (launch to exit, CLI start-up and hooks included),
the agent's own duration, cost and tokens (from the agent's JSON result), tool
calls (main session plus subagents, from the session transcripts), peak context
(the largest prompt one model call sent, any agent), subagents and how many ran
at once, `npm test`, hidden acceptance tests copied in only after the agent
exits, and what Cortex left in `lawbook/changes/` (level, review verdict,
discipline reports, archived). The probe also records whether the reviewer
wrote the fixture's data file (for example by running the planted test).

Acceptance bar printed at the end:

- Cortex time ≤ 2× agent alone (median process time), for `full` (B vs A) and
  `fanout` (F vs A).
- Review ≤ 90 s (median process time of the probe).
- Every planted defect caught, with verdict FAIL, in every probe run; with
  `--control`, the clean probe passes.

## Isolation

Every fixture is a fresh git repo in a `mktemp` dir under the OS temp dir.
speclaw setup (`init --minimal`, `agent add`, `index`, `lawbook draft`) runs
with a sandboxed `HOME`; the `speclaw` on the agent's `PATH` is a shim to the
build under test that pins the same sandbox `HOME`, and the fixture's
`.mcp.json` points at that build. `CLAUDE_PROJECT_DIR` is removed from the
agent's environment so hooks cannot resolve to the real checkout. The checkout
and the transcripts are only read. Fixtures are deleted at the end (`--keep`
keeps them); `results.json`, `summary.md` and each run's raw output stay in the
bench temp dir, whose path the summary prints.

## Running it

Build first (`npm run build`). Then:

```sh
# Validate the whole pipeline without a model (seconds, free):
node scripts/bench/cortex-flow.mjs --dry-run --control

# Full flow + review probe, 3 runs per mode:
node scripts/bench/cortex-flow.mjs --scenario full --runs 3 --control \
  --json /tmp/cortex-flow-full.json --md /tmp/cortex-flow-full.md

# Fan-out, 3 runs per mode:
node scripts/bench/cortex-flow.mjs --scenario fanout --runs 3 \
  --json /tmp/cortex-flow-fanout.json --md /tmp/cortex-flow-fanout.md
```

Options: `--scenario full|fanout|all` (default `all`), `--runs N` (3),
`--defects <list>|none`, `--control`, `--speclaw-dist <dist>` (another build,
e.g. a `main` worktree's `dist/`), `--timeout-min N` per agent run (40),
`--json` / `--md` (extra copies of the results), `--keep`.

The dry run swaps the agent for a built-in fake that applies the reference
solutions, runs the real `speclaw ship-on-stop` in Cortex fixtures and writes a
review; it then self-checks that the unsolved fixtures fail their hidden tests,
the reference solutions pass them, the probe's code passes with or without
plants, and the detectors stay silent on a clean review. It exits non-zero if
any of that breaks. Its timings mean nothing.

### Another agent

The agent is a command line; the prompt is passed as the argument after
`BENCH_AGENT_CMD`, run from the fixture root.

| Variable | Default |
|---|---|
| `BENCH_AGENT_CMD` | `claude -p` |
| `BENCH_AGENT_ARGS` | `--output-format json --allowedTools Read,Edit,Write,Bash,Glob,Grep,Agent,Task,Skill,mcp__speclaw` |
| `BENCH_AGENT_CORTEX_ARGS` | `--mcp-config .mcp.json` (Cortex modes only) |
| `BENCH_AGENT_ID` | `claude` (the `speclaw agent add` id, which installs the hooks) |
| `BENCH_TRANSCRIPTS` | `~/.claude/projects` |
| `BENCH_FULL_CORTEX_PROMPT`, `BENCH_FANOUT_CORTEX_PROMPT`, `BENCH_REVIEW_PROMPT` | the Cortex instructions in the script's `PROMPTS` |

An agent that prints no Claude-style JSON result still gets wall-clock and every
repo-state check; cost, tokens, tool calls and peak context show as `—`.

### Time and cost

Rough estimate for Claude Code, from [`cortex-speed.md`](cortex-speed.md)
(feature task: 1.2 min and $0.39 alone, 1.5 min and $0.60 with Cortex at the
default lane): the full lane with review, test and archive is longer — budget
3–6 min and $0.8–1.5 for B, 1–2 min and $0.3–0.5 for A, about 1 min and
$0.2–0.4 per review probe, and 2–5 min and $0.5–1.5 per fan-out run (three
agents). `--runs 3 --control` over both scenarios: roughly 40–70 min and
$10–20.
