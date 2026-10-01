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
| exploring | explorer | Compass-first investigation; writes nothing under `lawbook/` / `src/` |
| planning / questions | planner | Ceremony level + change artifacts; questions always go to the human |
| implementing | implementer | Code + tests + task checkboxes; stops before final gates |
| reviewing | reviewer | `reports/review.md` PASS/FAIL; no code patches (skipped at level 0) |
| testing | tester | Quality gates, manual verification, discipline reports |
| archiving | archiver | Sync + `lawbook_archive` in the same PR |

Max **3** review/test → implement reworks; then the coordinator asks the human.

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
