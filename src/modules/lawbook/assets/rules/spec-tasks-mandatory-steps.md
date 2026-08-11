---
description: Enforce the mandatory steps from lawbook/config.yaml when creating tasks.md, and ensure the agent executes all manual verification itself.
alwaysApply: true
---

# Spec Tasks: Mandatory Steps

When creating or updating a `tasks.md` inside a `lawbook/changes/<name>/`, you MUST:

## 1. Read lawbook/config.yaml first

Before writing tasks, read `lawbook/config.yaml` for the project's mandatory task
steps, branch convention, and testing/documentation requirements.

## 2. Include the mandatory steps, in order

- **Step 0 — Create the feature branch (must be first).** Follow the repo's
  branch pattern.
- Review and update the affected tests.
- Run the quality gates and verify they pass
  (see `docs/standards/testing-standards.md`).
- Perform manual verification of the behavior — **the agent executes this
  itself, never the user.**
- Produce the discipline reports under `reports/` — one per discipline the change
  touched, from an open set (`backend.md`, `frontend.md`, `api.md`, `database.md`,
  `infra.md`, … — `api.md` is required whenever the change touches an API surface;
  see the `spec-reports-disciplines` rule) with the unit/integration/e2e results
  for what the feature touched.
- Update the technical documentation the change touches.
- Archive the change within the same PR (the `archive` command / `lawbook_archive`
  tool).

## 3. Manual verification — the agent must execute it

The coding agent performs all manual testing itself (exercise the endpoint, UI,
or CLI). Never delegate it to the user. A task that requires verification is
not complete until the agent has verified it.

## 4. Archiving is part of the change

A change is not done until it is archived with `lawbook_archive` (never a manual
`mv`). The archive lands in the same PR that implements the change.

`lawbook_archive` is gated: it refuses to archive while any task is unchecked,
while `reports/` has no discipline report, or while the delta specs are not yet
synced into the canonical specs. Resolve those first — the gate is enforced in
the engine, so a manual `mv` only hides an incomplete change.
