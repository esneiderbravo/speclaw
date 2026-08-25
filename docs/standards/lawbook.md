# Lawbook — speclaw

The process law of the project — see [`../../LAWS.md`](../../LAWS.md). This
repo is spec-driven through speclaw's **spec** module (no external CLI; the
mechanical steps are speclaw MCP tools).

## The loop

No non-trivial change lands without a lawbook change. Artifact volume follows
the **confirmed ceremony level** in `change.json` (0=quick … 3=full). Missing
`change.json` means level 3 (today's full set).

1. **explore** — think an idea through before committing (writes nothing).
2. **draft** / **quick** — propose a ceremony level from graph signals
   (`lawbook_level` / `speclaw lawbook level` **propose**), **set** or
   **promote** it, then scaffold only what that level needs:
   - **0** — `record.md` (inline checklist) + `reports/` (`speclaw quick`)
   - **1** — record + `tasks.md` + ≥1 delta requirement + reports
   - **2** — `proposal.md` + tasks + delta specs + reports (design optional
     with justification)
   - **3** — proposal + design + tasks + delta specs + reports
   - **bug** — `bugfix.md` instead of proposal/design (`speclaw lawbook draft --bug`,
     `changeType: bug` in `change.json`); feature ceremony is unchanged. Use
     **`investigate`** / `lawbook_investigate` for graph-backed RCA first. Requires
     reproduction, regression test, and prevention (§7); delta spec only when prevention
     finds a missing requirement. Security-withheld mode is not in this release.
3. **build** — implement the tasks in order, keeping code and spec in
   agreement, and write the discipline reports under `reports/`.
4. **sync** — reconcile the delta specs against what was actually built, then
   promote them into the canonical `lawbook/specs/` (`lawbook_sync`) when the
   level requires specs. The tool is a deterministic copy; the agent does the
   code↔spec reconciliation first.
5. **archive** — finalize: reconcile, sync when needed, then move the change to
   `lawbook/changes/archive/` (`lawbook_archive`), **within the same PR** —
   never a post-merge chore. The archive is gated (see below).

## Mandatory task steps

`tasks.md` MUST include the steps defined in `lawbook/config.yaml` and the
`spec-tasks-mandatory-steps` rule: feature branch first, tests reviewed and
run, manual verification executed by the agent, discipline reports produced,
docs updated, archive within the PR. The agent performs the manual testing
itself — never delegates it.

## Reports

Every change carries a `reports/` folder. `build` writes one report per
discipline it touched, named for that discipline — an open set (`backend.md`,
`frontend.md`, `api.md`, `database.md`, `infra.md`, … — `api.md` required
whenever the change touches an API surface) recording what was tested
and the real results — unit, integration, and end-to-end as applicable — with
the commands run and their output. It is evidence of testing that travels with
the change; the archive is blocked until at least one discipline report exists.

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

Before archiving, the agent runs a reconciliation review: it compares what was
built against the delta specs and, when the code has drifted past the original
contracts, shows short insights and reconciles the delta specs.

`lawbook_archive` is then **gated in the engine** — it refuses to archive (and
reports the reason) while any task is unchecked (or the level-0 checklist in
`record.md`), while `reports/` holds no discipline report, while delta specs
are required but not yet synced into the canonical specs, or while an
identified requirement has a direct coverage defect (`speclaw coverage` /
`lawbook_coverage`; disable with `coverage.gateArchive: false` in
`lawbook/config.yaml`). Because the gate covers both the tool and the CLI, a
change reaches the archive only when it is genuinely complete.

## Coverage and drift

- **Coverage** — identify requirements with ids (`req~name~1`) and link
  implementations/tests with `// Covers:` (or `@covers`) comments.
  `speclaw coverage` / `lawbook_coverage` reports requirement → impl → test.
  Defaults live under `coverage.defaultNeeds` / `coverage.gateArchive` in
  `lawbook/config.yaml`. Declare `Needs: ptest` (source of truth) when a
  requirement needs a property test; optional `Verification: property` expands
  effective needs to include `ptest`. speclaw recognizes runners (fast-check,
  Hypothesis, …) near the `Covers:` line — it does **not** run or generate
  property tests.
- **EARS** — configure `ears.severity` (`strict` | `lenient`), `vagueWords`, and
  `silentCodes` in `lawbook/config.yaml`.
- **Drift** — sealed spec↔code snapshots live in committed
  `lawbook/anchors/*.json` (dual body/norm hashes). `speclaw drift` /
  `lawbook_drift` classifies change; after a Compass schema bump, reindex with
  `speclaw index`, then `speclaw drift --reseal` once to photograph current
  bodies.

## Integrity and ownership

- **`speclaw.lock`** is committed at the repo root (never under `.speclaw/`).
  `speclaw laws lock` / `accept` / `scan`; digest acceptance is interactive TTY
  only — never via MCP. `speclaw verify` folds integrity with deps/graph.
- **`team.owners`** in `lawbook/config.yaml` maps capabilities (and `"*"`) to
  owners. `speclaw owners --write` compiles a managed block at the **end** of
  `.github/CODEOWNERS` (CLI only; `deriveFromTraceability` is not enabled).

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
