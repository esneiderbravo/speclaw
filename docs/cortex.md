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

## MCP tool `cortex`

| Action | Use it to |
|--------|-----------|
| `status` | Read `harness.json` (or null if not started) |
| `start` | Create harness at `exploring` for a change |
| `advance` | Legal one-step transition (PASS verdict required leaving review/test) |
| `rework` | FAIL from reviewing/testing → implementing (counts toward max rework) |
| `brief` | Stage + role + skill hints + suggested next ops (handoff for Task spawn) |

Same surface on the CLI: `speclaw cortex <action> --change <name> […]`.

`lawbook_change` action `harness` and `speclaw lawbook harness` remain as
deprecated aliases for one release.

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
