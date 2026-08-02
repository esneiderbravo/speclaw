---
description: Enforce the mandatory steps from spec/config.yaml when creating tasks.md, and ensure the agent executes all manual verification itself.
alwaysApply: true
---

# Spec Tasks: Mandatory Steps

When creating or updating a `tasks.md` inside a `spec/changes/<name>/`, you MUST:

## 1. Read spec/config.yaml first

Before writing tasks, read `spec/config.yaml` for the project's mandatory task
steps, branch convention, and testing/documentation requirements.

## 2. Include the mandatory steps, in order

- **Step 0 — Create the feature branch (must be first).** Follow the repo's
  branch pattern.
- Review and update the affected tests.
- Run the quality gates and verify they pass
  (see `docs/standards/testing-standards.md`).
- Perform manual verification of the behavior — **the agent executes this
  itself, never the user.**
- Update the technical documentation the change touches.
- Archive the change within the same PR (the `archive` command / `spec_archive`
  tool).

## 3. Manual verification — the agent must execute it

The coding agent performs all manual testing itself (exercise the endpoint, UI,
or CLI). Never delegate it to the user. A task that requires verification is
not complete until the agent has verified it.

## 4. Archiving is part of the change

A change is not done until it is archived with `spec_archive` (never a manual
`mv`). The archive lands in the same PR that implements the change.
