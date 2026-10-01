# Lawbook — speclaw

The process law of the project — see [`../../LAWS.md`](../../LAWS.md). This
repo is spec-driven through speclaw's **spec** module (no external CLI; the
mechanical steps are speclaw MCP tools).

## The loop

No non-trivial change lands without a lawbook change. Artifact volume follows
the **confirmed ceremony level** in `change.json` (0=quick … 3=full). Missing
`change.json` means level 3 (today's full set).

The default execution model is **Cortex** (*One brain. Many agents.*): the host
primary agent is the **coordinator** and dispatches (or role-plays) specialized
roles via the `cortex` skill. State lives in `lawbook/changes/<name>/harness.json`
(`speclaw cortex` / MCP tool `cortex`). Lawbook owns specs, ceremony, coverage,
and drift; Cortex owns the multi-agent loop.

1. **explore** (explorer) — think an idea through before committing (writes
   nothing). Bugs use **investigate** first.
2. **draft** / **quick** (planner) — propose a ceremony level from graph signals
   (`lawbook_level` / `speclaw lawbook level` **propose**), **set** or
   **promote** it, then scaffold only what that level needs:
   - **0** — `record.md` (inline checklist) + `reports/` (`speclaw quick`)
   - **1** — record + `tasks.md` + ≥1 delta requirement + reports
   - **2** — `proposal.md` + tasks + delta specs + reports (design optional
     with justification)
   - **3** — proposal + design + tasks + delta specs + reports
   - **bug** — `bugfix.md` instead of proposal/design (`speclaw lawbook draft --bug`,
     `changeType: bug` in `change.json`); feature ceremony is unchanged.
   Planner questions always surface to the human via the coordinator.
3. **build** (implementer) — implement the tasks in order, keeping code and
   spec in agreement. Stops at implementation hand-off (does not own final
   gates or archive).
4. **review** (reviewer) — writes `reports/review.md` with PASS/FAIL; no code
   patches. Skipped at ceremony level 0.
5. **test** (tester) — quality gates, manual verification, discipline reports
   under `reports/`. May add missing tests only.
6. **sync** / **archive** (archiver) — reconcile delta specs, promote when
   needed, then `lawbook_archive` **within the same PR**. Archive is gated on
   harness verdicts (test PASS; review PASS when level ≥ 1) plus the existing
   task/report/sync/coverage gates.

Entry point: `/lawbook/cortex` (or the `cortex` skill). Per-stage commands
remain available to force a single role. Full cheat sheet:
[`docs/cortex.md`](../cortex.md).

## Mandatory task steps

`tasks.md` MUST include the steps defined in `lawbook/config.yaml` and the
`spec-tasks-mandatory-steps` rule: feature branch first, tests reviewed and
run, manual verification executed by the **tester** role, discipline reports
produced, docs updated, archive within the PR. The tester performs manual
verification itself — never the user; the coordinator must not archive without
a test PASS.

## Reports

Every change carries a `reports/` folder. The **tester** writes one report per
discipline the change touched, named for that discipline — an open set
(`backend.md`, `frontend.md`, `api.md`, `database.md`, `infra.md`, … —
`api.md` required whenever the change touches an API surface) recording what
was tested and the real results — unit, integration, and end-to-end as
applicable — with the commands run and their output. The **reviewer** writes
`review.md` with a harness verdict. Evidence travels with the change; archive
is blocked until at least one discipline report exists and harness verdicts
pass.

## Delta specs

- Normative requirements use SHALL/MUST and SHOULD fit an **EARS** mold
  (ubiquitous / WHEN / WHILE / IF…THEN / WHERE / complex). `speclaw lawbook
  validate` classifies each requirement; with `ears.severity: strict` (default
  for new projects and for speclaw itself), unstructured bodies and missing
  modals are blocking issues. Suggestions are advisory — speclaw never
  auto-rewrites requirement files.
- Requirement headers use `### Requirement:`.
- Scenario headers use exactly `#### Scenario:`.
- Acceptance criteria are testable without production integrations.
- The implemented code must match what the delta spec promises. Validate with
  the `lawbook_validate` tool before syncing or archiving.

## Archiving discipline

Always archive with the `archive` command / `lawbook_archive` tool, never a manual
`mv` — the tool performs the spec promotion and validation a manual move skips.

Before archiving, the archiver runs a reconciliation review: it compares what was
built against the delta specs and, when the code has drifted past the original
contracts, shows short insights and reconciles the delta specs.

`lawbook_archive` is then **gated in the engine** — it refuses to archive (and
reports the reason) while any task is unchecked (or the level-0 checklist in
`record.md`), while `reports/` holds no discipline report, while delta specs
are out of sync when required, while coverage defects block (when enabled), or
while harness review/test verdicts are not PASS (and stage is not
`archiving`/`done`).

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
