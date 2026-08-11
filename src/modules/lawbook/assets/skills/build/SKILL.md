---
name: build
description: Implement the tasks of a drafted change, following its spec and the project's standards. Use when the user wants to start or continue implementing a change: "build X", "implement the change", "work through the tasks", "continue X". Part of speclaw's lawbook module (draft → build → sync → archive).
---

# build — Implement a change

Work through a change's `tasks.md` in order, keeping code, spec, and standards
in lockstep.

## Step 0 — Load the change

- Read `lawbook/changes/<name>/proposal.md`, `tasks.md`, and the delta specs under
  `specs/`. If unsure which change, run `lawbook_list`.
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

**Verification is isolated by construction — it never touches real data.** Run it
against an ephemeral or throwaway store: a temporary copy, an in-memory database
(`:memory:`), a dedicated test store, or inside a transaction that is rolled
back — best of all, verify pure/domain logic with fixtures and no store at all.
Do **not** create, update, or delete the user's real data (a production or
development database, or files holding real data) as a side effect of proving a
change, and do **not** run raw store commands (e.g. direct SQL) against a live
store. Snapshot-and-restore is not a sanctioned method — a stray write slips past
the restore.

If isolation is genuinely impossible and a real-store write is unavoidable,
**stop and ask first** — state exactly what you will write and to which store —
and proceed only after explicit authorization. A backup is not a substitute for
authorization. Record in the report how verification stayed isolated (or the
authorization you obtained).

## Step 5 — Write the discipline reports (mandatory)

Record the evidence of testing under `lawbook/changes/<name>/reports/`, one file
per discipline the change touched, named for that discipline. The set is **open,
not a fixed list** — `backend.md`, `frontend.md`, and `api.md` are the common
ones, but write `database.md`, `infra.md`, `security.md`, `performance.md`,
`e2e.md`, etc. when the change exercises those concerns, and coin a clear
`<discipline>.md` for anything none of them fit. Omit disciplines the change did
not touch; the archive is blocked until at least one discipline report exists.

**`api.md` is mandatory whenever the change touches an API surface** — a new or
modified endpoint, its request/response contract, its status codes, or its
auth/permission or ordering guarantees. A `backend.md` unit report does not
substitute for it: the contract is a distinct concern. In `api.md` document the
method and path, the auth/permissions, the response shape and every status code
the change governs (e.g. `200`/`401`/`403`/`404`), any ordering guarantee, and
how the contract was exercised (test client and/or `curl`) — kept isolated from
any live data store per Step 4.

Each report MUST follow this structure, in order — the fixed shape is what makes
the evidence trustworthy and reproducible, rather than left to improvisation:

1. **Title + header** — `# <Discipline> checks — <change> (<date>)`, then a line
   `Date · Branch · Environment/cwd` naming where the commands ran.
2. **Gates & results** — a `| Check | Command | Result |` table: each gate, the
   exact command, and its real result with pass/fail counts (e.g. "62 files, 434
   passed") and ✅/⚠️/❌. Quote real output — never paraphrase a green you did
   not see.
3. **Tests added / updated** — each new or changed test and what it asserts; note
   TDD evidence ("failed before the fix, passes after") where it applies.
4. **Spec-scenario coverage** — a table mapping each `#### Scenario` in this
   change's delta specs to how it was verified (a test id, a gate, or a manual
   step). Every scenario must appear.
5. **Pre-existing / unrelated failures** — any failing check not caused by this
   change, with proof it is pre-existing (e.g. it reproduces with the change
   stashed) — or state "none".
6. **Pending manual steps** — anything not automated, stated plainly — or "none".
7. **Verdict** — one line.

If a test kind does not yet apply (e.g. no unit runner), the report says so in
place of that evidence and records the gates and manual verification that stood
in.

## Step 6 — Hand off

When every task is checked and gates are green, tell the user the change is
ready to `sync` and `archive`. Keep the delta specs current as you build, but
know that `sync` formally reconciles the delta specs against what was actually
built — so behavior that drifted past the original spec is caught there, not
left to chance.
