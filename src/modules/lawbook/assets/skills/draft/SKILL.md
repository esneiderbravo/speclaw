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

- **Refresh the index first.** Run `compass_index` before reasoning about the
  code — it is incremental (unchanged files are skipped by hash), so this is
  cheap and guarantees your decisions rest on the current graph, not a stale one.
- Clarify what the user wants (feature / fix / refactor) and confirm scope.
- Use `compass_explore` and `compass_recall` (speclaw's code index) BEFORE
  grep/read to locate the real code the change touches and its blast radius.
- Read the governing standards in `docs/standards/` (architecture, backend,
  frontend, testing) so the change complies with the project's law.

## Step 2 — Pick a change name and its capabilities

- **Change name:** kebab-case, action-oriented (e.g. `add-login`,
  `fix-shift-overlap`). This is the folder under `lawbook/changes/`, and it is
  per-feature — always distinct.
- **Capabilities:** run `lawbook_list` to see the canonical capabilities. A
  capability is the living contract for an area of behavior — it is *not* the
  change. When your change modifies behavior an existing capability already
  governs, reuse that capability's **exact** name so `sync` updates its spec.
  Introduce a new capability only as a deliberate choice for a genuinely distinct
  area of behavior — never as a near-duplicate (`transfer` next to an existing
  `transfers`) of one that already exists.

## Step 3 — Write the artifacts

Create under `lawbook/changes/<name>/`:

- **proposal.md** — the why, the what, non-goals, and whether migrations are
  needed. Reference the team's tracker ticket if there is one.
- **specs/<capability>/spec.md** — the delta spec for each affected capability.
  `sync` promotes this by overwriting the whole canonical file, so the delta must
  carry the capability's **full** intended spec. When you are updating an existing
  capability, **start from the current `lawbook/specs/<capability>/spec.md`** and
  edit on top of it, so its existing requirements are carried forward — do not
  author it from scratch, or promotion will silently drop them. Use normative
  language and testable scenarios:
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
  manual verification executed by the agent; discipline reports produced; docs
  updated; archive within the PR).
- **reports/** — create the folder with a short `reports/README.md` naming the
  discipline reports (`backend.md`, `frontend.md`, … as relevant) that `build`
  will fill, following the required report structure (header · gates table ·
  tests added · spec-scenario coverage · pre-existing failures · pending manual ·
  verdict — see the `build` skill, Step 5). Every change ships this folder;
  archive is blocked until it holds at least one discipline report.

## Step 4 — Validate

Run the `lawbook_validate` tool for the change and fix every issue it reports
(missing artifacts, non-normative specs, missing scenarios) before handing off
to implementation. Read its advisory **warnings** too: a near-duplicate
capability name usually means you should reuse the existing capability's exact
name, and a dropped-requirement warning means the delta should start from the
canonical. Warnings do not block, but resolve them unless the divergence is
intentional.

## Step 5 — Hand off

Summarize the change and tell the user it's ready to `build`.
