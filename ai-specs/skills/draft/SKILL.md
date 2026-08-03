---
name: draft
description: Draft a new spec-driven change — proposal, delta specs, and tasks — before writing any code. Use when the user wants to start, plan, or propose a new feature, fix, or refactor: "draft a change for X", "propose X", "let's plan X", "spec out X", "new change". Part of speclaw's lawbook module (draft → build → sync → archive).
---

# draft — Draft a new change

Turn a request into a complete, reviewable change under `lawbook/changes/<name>/`
before any implementation. This is speclaw's own spec-driven workflow — no
external CLI; the mechanical steps are speclaw MCP tools.

## Step 0 — Ensure the workspace exists

If `lawbook/` is missing, run the `lawbook_init` tool once to create it.

## Step 1 — Understand the request and the code

- Clarify what the user wants (feature / fix / refactor) and confirm scope.
- Use `compass_explore` and `compass_recall` (speclaw's code index) BEFORE
  grep/read to locate the real code the change touches and its blast radius.
  If the index is stale or missing, run `compass_index` first.
- Read the governing standards in `docs/standards/` (architecture, backend,
  frontend, testing) so the change complies with the project's law.

## Step 2 — Pick a change name

Kebab-case, action-oriented (e.g. `add-login`, `fix-shift-overlap`). This is
the folder under `lawbook/changes/`.

## Step 3 — Write the artifacts

Create under `lawbook/changes/<name>/`:

- **proposal.md** — the why, the what, non-goals, and whether migrations are
  needed. Reference the team's tracker ticket if there is one.
- **specs/<capability>/spec.md** — the delta spec for each affected capability.
  Use normative language and testable scenarios:
  ```markdown
  # <Capability>

  ### Requirement: <name>
  The system SHALL <requirement>.

  #### Scenario: <name>
  - Given <context>
  - When <action>
  - Then <observable outcome>
  ```
- **design.md** — always: approach, alternatives weighed, and the trade-offs
  behind the decision. For a small change, keep it short — but write it.
- **tasks.md** — ordered, checkable steps. MUST include the mandatory steps
  from `lawbook/config.yaml` (feature branch first; tests reviewed and run;
  manual verification executed by the agent; docs updated; archive within the
  PR).

## Step 4 — Validate

Run the `lawbook_validate` tool for the change and fix every issue it reports
(missing artifacts, non-normative specs, missing scenarios) before handing off
to implementation.

## Step 5 — Hand off

Summarize the change and tell the user it's ready to `build`.
