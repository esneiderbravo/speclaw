# Cortex — One brain. Many agents.

**Cortex** is speclaw's multi-agent coordination brain: one coordinator dispatches
specialized roles (explorer → planner → implementer → reviewer → tester →
archiver) through a durable harness. It is a first-class module — MCP tool
`cortex`, CLI `speclaw cortex`, skill `/lawbook/cortex` — not a metaphor and not
an LLM runtime. Speclaw stays 100% local; the host agent (Cursor, Claude Code,
…) spawns or adopts each role.

Lawbook owns **specs, ceremony, coverage, and drift**. Cortex owns the
**loop** — who acts when, what they may do, and whether archive is allowed.

## Why use it

| Without Cortex | With Cortex |
|----------------|-------------|
| One agent does explore + code + review + test + archive | Each stage has a role with a permission profile |
| No durable stage — context resets mid-change | `harness.json` records stage, verdicts, rework count |
| Review/test optional folklore | Archive blocked until review/test PASS (by level) |
| "Orchestrate" as a vague verb | Product identity: **CORTEX** — the brain of the suite |

## The loop

```
  exploring → planning ⇄ questions → implementing
       → reviewing ⇄ implementing → testing ⇄ implementing
       → archiving → done
```

| Stage | Role | Owns |
|-------|------|------|
| exploring | explorer | Compass-first investigation; a complete brief for the planner; writes nothing under `lawbook/` / `src/` |
| planning / questions | planner | Ceremony level + change artifacts from that brief; Compass only for a gap the brief names; questions always go to the human |
| implementing | implementer | Code + tests + task checkboxes; stops before final gates |
| reviewing | reviewer | `reports/review.md` PASS/FAIL; no code patches (skipped at level 0) |
| testing | tester | Quality gates, manual verification, discipline reports |
| archiving | archiver | Sync + `lawbook_archive` in the same PR |

Max **3** review/test → implement reworks; then the coordinator asks the human.

**The level is re-read on every move.** `advance` and `rework` read
`confirmedLevel` from `change.json` before routing and store it as the harness
`level`, so a `lawbook_change` action `level` set after `start` governs the
next step. A missing `change.json` or a `change.json` without `confirmedLevel`
counts as level 3, so an unconfirmed change never skips `planning`. A bug
draft (`speclaw lawbook draft --bug <name>`) without `--level` starts
unconfirmed: its `bugfix.md` says `Level: unconfirmed` and validate holds it to
level-3 bug rules until a human sets a level.

**Questions pause only from `planning`.** `advance` with `pauseForQuestions`
(CLI `--pause-questions --question …`) moves `planning` to `questions` and
records the questions. From any other stage it is rejected with
`pauseForQuestions is only valid from stage planning (current: <stage>)`,
`harness.json` stays byte-identical, and the CLI exits 1 — nothing advances
and no question is dropped.

**Archive completes the harness.** `lawbook_archive` / `speclaw lawbook archive`
moves the harness from `archiving` to `done` (one `history[]` entry) just before
it moves the change to `lawbook/changes/archive/<date>-<name>/`, restores the old
`harness.json` if the move fails, and reports `harnessCompleted` in its result.
Nobody calls `advance` after an archive: the coordinator confirms with `status`
that the stage is `done`. Afterwards Cortex resolves the name to the newest
`archive/<YYYY-MM-DD>-<name>/`, so `status` and `brief` keep working (the task
counts come from the archived `tasks.md`), while `start`, `advance`, and `rework`
are rejected without writing (`change <name> is archived (…); Cortex ops are
read-only`).

## Compass-first evidence gate (`compassGate`)

Leaving **`exploring`** or **`implementing`** with `advance` checks the Compass
call log (`.speclaw/compass-calls.jsonl`, see
[`compass.md`](compass.md#compass-first-enforcement)) for **evidence calls**
since the current stage started: `compass_explore`, `compass_find`,
`compass_diff_context`, or the aliases `compass_impact`, `compass_trace`,
`compass_search`, `compass_recall`. `compass_index` does not count.

The window starts at the newest `harness.json` history entry that entered the
current stage, so a `rework` back to `implementing` starts a fresh window.

Set the mode with a top-level key in `lawbook/config.yaml`:

```yaml
compassGate: warn # off | warn | strict (default warn)
```

| Mode | No evidence in the window |
|------|---------------------------|
| `off` | No check; no `compassEvidence` in the result |
| `warn` (default, also for a missing or invalid key) | Advances; result carries `warnings: ["compass-first: …"]` |
| `strict` | Rejected with an error naming the stage, the evidence tools, and `compassGate`; `harness.json` is left byte-identical |

Every gated advance returns `compassEvidence: { mode, stage, since, calls }`
(never written to `harness.json`). `speclaw cortex advance` (and the
`lawbook harness` alias) prints the evidence count and any warning on stderr;
stdout stays JSON. `start`, `status`, `rework`, and advances from any other
stage are never gated.

**Limitation — the window is per project, not per session.** The call log is
shared by everything running in the repo, so a concurrent session (or a human
running `speclaw explore`) can satisfy another session's gate.

## Status updates (`cortex.statusIntervalMinutes`)

`status` returns a `summary` first, then `state`:

| Field | Meaning |
|-------|---------|
| `change`, `stage`, `role` | The change, its stage, and the role `brief` maps the stage to |
| `stageStartedAt`, `elapsedMinutes` | When the stage started (newest history entry into it) and whole minutes since |
| `tasks` | `{done, total}` from the `tasks.md` checkboxes (`record.md` at level 0), or null |
| `iteration`, `maxRework` | Rework count and cap |
| `pendingVerdicts` | `review` (level ≥ 1) and/or `test` while not `PASS` |
| `openQuestions` | Count of open planner questions |
| `statusIntervalMinutes` | The configured update interval (below) |
| `line` | One-line English rendering, e.g. `demo · implementing (implementer) · 12m in stage · tasks 3/9 · rework 0/3 · pending: review, test` |

Set the interval in `lawbook/config.yaml`:

```yaml
cortex:
  statusIntervalMinutes: 5 # minutes; 0 disables (default 5, at most 60)
```

A missing file, block, or key, or a value that is not a whole number ≥ 0,
means 5. Values above 60 are capped at 60, so the timer is always a valid cron
schedule (`*/N * * * *` for 1–59, hourly for 60). During a run the `cortex` skill posts a compact update after every
Cortex op and before every blocking role dispatch, written in the session's
language (stage, role, and tool names, paths, and change names stay in
English). Where the host has a session timer (Claude Code `CronCreate`), the
coordinator also creates one recurring timer every N minutes (only for an
active run: summary non-null, stage not `done`), keeps the id `CronCreate`
returns so exactly one exists, gives it a prompt that names the change and
the rules, prefers
background dispatch so it can fire, skips pings in `questions`, and deletes it
(`CronDelete`) at `done`, when the run stops, or when the human asks to stop
the updates. Hosts without a timer rely on the after-op and before-dispatch
updates. `0` disables every unsolicited update; an explicit request for status
is always answered.

## MCP tool `cortex`

| Action | Use it to |
|--------|-----------|
| `status` | Read `harness.json` plus a status `summary` (both null if not started) |
| `start` | Create harness at `exploring` for a change |
| `advance` | Legal one-step transition (PASS verdict required leaving review/test) |
| `rework` | FAIL from reviewing/testing → implementing (counts toward max rework) |
| `brief` | Stage + role + skill hints + suggested next ops (handoff for Task spawn) |

Same surface on the CLI: `speclaw cortex <action> --change <name> […]`.
`speclaw cortex status` also writes `summary.line` to stderr (stdout stays the
JSON document); `--json` suppresses the stderr line. A missing change exits 1;
an archived change is read through `status` / `brief` (see the loop above).

On the MCP path, `status` is fitted to the brief output budget: `summary` is
always complete, and when the JSON would be too long the oldest
`state.history` entries are dropped (newest kept) and counted in
`historyOmitted`. If even an empty history does not fit, `state` is `null`
with `stateOmitted: true`. The CLI and `harness.json` keep the full history.

`lawbook_change` action `harness` and `speclaw lawbook harness` remain as
deprecated aliases for one release. Their `status` also returns `summary`
(fitted the same way on MCP); the alias CLI prints no stderr line.

## Entry points

- **Skill / command** — `cortex` / `/lawbook/cortex` (coordinator; never implements product code)
- **MCP** — canonical tool `cortex` (9th suite tool alongside Compass / Lawbook / Foundation)
- **CLI** — `speclaw cortex status|start|advance|rework|brief`

Per-stage skills remain (`explore`, `draft`, `build`, `test`, `sync`, `archive`)
for forcing a single role.

## Files

| Path | Purpose |
|------|---------|
| `lawbook/changes/<name>/harness.json` | Durable stage + verdicts + history |
| `ai-specs/agents/<role>.md` | Role contracts (explorer…archiver) |
| `ai-specs/skills/cortex/` | Coordinator dispatcher |
| `src/modules/cortex/` | Motor + MCP registration (no lawbook imports) |

## Related

- [`docs/standards/lawbook.md`](standards/lawbook.md) — ceremony, artifacts, archive gates
- [`docs/compass.md`](compass.md) — Compass-first navigation for every role
- [`docs/standards/architecture.md`](standards/architecture.md) — module boundaries
