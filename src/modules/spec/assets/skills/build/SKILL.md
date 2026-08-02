---
name: build
description: Implement the tasks of a drafted change, following its spec and the project's standards. Use when the user wants to start or continue implementing a change: "build X", "implement the change", "work through the tasks", "continue X". Part of speclaw's spec module (draft → build → sync → archive).
---

# build — Implement a change

Work through a change's `tasks.md` in order, keeping code, spec, and standards
in lockstep.

## Step 0 — Load the change

- Read `spec/changes/<name>/proposal.md`, `tasks.md`, and the delta specs under
  `specs/`. If unsure which change, run `spec_list`.
- Read the governing standards in `docs/standards/` for the areas you'll touch.

## Step 1 — Branch first

Create the feature branch (the mandatory Step 0 in `tasks.md`), following the
repo's branch pattern `{{branch_pattern}}`.

## Step 2 — Implement task by task

- Use `compass_explore` before editing to see a symbol's callers/callees and
  blast radius; re-run `compass_index` after significant edits to keep the
  graph fresh.
- Make the smallest correct change; match the surrounding code.
- The code must satisfy the delta spec exactly. If reality diverges from the
  spec, update the spec in the change (not silently) — the two must agree.
- Check off each task in `tasks.md` as you complete it.

## Step 3 — Quality gates (mandatory)

Run the repo's gates from `docs/standards/testing-standards.md`:

- Tests: `{{test_commands}}`
- Lint / type-check: `{{lint_commands}}`

Run them yourself and report real output. A red gate blocks completion.

## Step 4 — Manual verification (mandatory, agent executes)

Exercise the behavior (endpoint/UI/CLI) yourself where feasible — do not
delegate manual testing to the user. Record what you verified.

## Step 5 — Hand off

When every task is checked and gates are green, tell the user the change is
ready to `sync` and `archive`.
