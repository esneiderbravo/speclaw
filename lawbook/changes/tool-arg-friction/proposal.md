# tool-arg-friction

## Why

In five weeks of real ftd-admin-finanzas sessions, 67 of 584 speclaw MCP calls
failed (11 %). Most failed on an argument speclaw can work out itself: `archive`
without `date` (14), `level set` without `change` (7), `cortex` on a change not
yet drafted, `compass_explore` given a phrase instead of `node`, action
`create`. Each failure costs the agent another model turn — time and context —
which works against speclaw 3.0.0's goal of adding no time over an agent alone.

## What changes

Tool arguments:

- `archive` defaults `date` to today; `archive` and level-0 `ship` sync an
  unsynced delta themselves.
- The change is inferred when left out: `name`, else the only active change,
  else the branch's change; otherwise the error lists the active changes.
- `create`/`new` mean `draft`; a separated `paths`/`symbols` string is a list.
- `compass_explore` with `query` and no `node` answers as a find.
- `cortex` on an undrafted change says to draft it first.

Gate time and ceremony (found by real agent runs on a copy of this repo,
`reports/agent-runs.md`: 80–85 % of an agent's time was the 82 s test suite, and
speclaw ran it twice; a one-line fix measured level 1 and wrote ~290 lines of
lawbook):

- The Stop hook's test gate runs the tests the diff reaches; the full suite runs
  in CI. It falls back to the full suite with no index, a global file, or code no
  test reaches; `ship.tests: full` keeps the full suite at the stop.
- CLAUDE.md, AGENTS.md and testing-standards (templates and this repo's copies)
  tell the agent to run only the tests covering its change instead of
  contradicting the hook.
- A diff of at most one source file and ten lines, with no public API or global
  file, measures level 0.

Result: speclaw went from 1.37–1.80× an agent alone to 0.65–1.24×, quality
unchanged.

## Impact

- Capabilities: `tool-arguments` (new), `ship` (small-fix level, scoped test gate).
- Modules: `lawbook` (change-tool, engine, ship, register, archive command
  doc), `compass` (register), `cortex` (harness error), `foundation` (CLAUDE/AGENTS/
  testing-standards templates); docs: `docs/cortex.md`.
- MCP schemas: `lawbook_change` gains optional `name`; `compass_explore` gains
  optional `query` and `node` becomes optional; the `lawbook_archive`,
  `lawbook_validate` and `lawbook_sync` aliases take optional `change`/`date`.
  No argument that worked before stops working.
