# AGENTS.md — {{project_name}}

Operating contract for **every** AI agent (Claude Code, Cursor, Codex, or any
other) working in this repository. These rules are STRICT and non-negotiable.
Claude-specific notes: [`CLAUDE.md`](CLAUDE.md). The law: [`LAWS.md`](LAWS.md).

## Project

- **What it is**: {{project_description}}
- **Organization**: {{organization}}
- **Stack**: {{stack_summary}}

## Mandatory operating rules

1. **Read [`LAWS.md`](LAWS.md) first.** It is the constitution; it binds the
   standards below. Open the standard that governs your change before making
   it. Conflicts resolve in favor of the standard; amendments go through a
   spec change, never silent deviation.
2. **Compass first, always** — for any code question call `compass_find` /
   `compass_explore` **before** any grep/sed/cat/Read,
   including files you already know by name. Fall back to manual file tools only
   after Compass returns nothing useful, the graph is missing (`compass_index`
   first; Claude Code sessions refresh an existing index at start), or the
   target isn't indexed code (stylesheets, config, logs). Cheat
   sheet: [`docs/compass.md`](docs/compass.md).
3. **Cortex, always — one brain on the critical path** (*One brain. Many
   agents.*). Branch `<type>/<slug>`, locate with Compass, implement the
   change and its test yourself, run the tests, finish. The `Stop` hook
   (`speclaw ship-on-stop`) — or `speclaw ship <change> --summary "<what and
   why>"` as your last step on agents without hooks — sizes the change from
   its diff, names the artifacts that level owes while you edit (the why,
   tasks, delta specs, proposal/design; write them in the same turn), runs the
   gates once, writes the report
   from their real output, and archives level-0 work. Commit with a message
   whose body says why. Review happens on the PR and never blocks the agent. Add
   agents only to run three or more large, independent parts in parallel.
   Details: the `cortex` skill and
   [`docs/standards/lawbook.md`](docs/standards/lawbook.md).
4. **Run the quality gates yourself** before declaring anything done — see
   [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md):
   - Tests: `{{test_commands}}`
   - Lint / type-check: `{{lint_commands}}`
5. **Respect the conventions** — branches `{{branch_pattern}}`, commits
   {{commit_style}}, code that reads like its neighbors. See
   [`docs/standards/base-standards.md`](docs/standards/base-standards.md) and
   [`docs/standards/conventions.md`](docs/standards/conventions.md).
6. **Use the skills and role agents.** `ai-specs/` is the canonical home for
   skills, commands, rules, and agents; agents read them through the symlinks
   in `.agents/` (plus an IDE folder only for an agent added explicitly).
7. **Ask before irreversible or outward-facing actions** — destructive commands;
   writing to a real data store (DB rows or files with real user data, including
   for tests — verify against an isolated/throwaway store); publishing
   reviews/tickets/comments. Planner questions always go to the human.

## The standards (the law, in detail)

| Standard | Governs |
|----------|---------|
| [`docs/standards/base-standards.md`](docs/standards/base-standards.md) | Languages, commits, comments, dependencies |
| [`docs/standards/architecture.md`](docs/standards/architecture.md) | Modules, layering, boundaries |
| [`docs/standards/backend-standards.md`](docs/standards/backend-standards.md) | Backend layers, docstrings, typing, migrations |
| [`docs/standards/frontend-standards.md`](docs/standards/frontend-standards.md) | Frontend layers, rendering, i18n, UI |
| [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md) | Quality gates, testing rules |
| [`docs/standards/documentation.md`](docs/standards/documentation.md) | Docstring/API-comment convention per language |
| [`docs/standards/conventions.md`](docs/standards/conventions.md) | Branches, PRs, tracker, versioning |
| [`docs/standards/lawbook.md`](docs/standards/lawbook.md) | Spec-driven workflow, archiving |
| [`docs/compass.md`](docs/compass.md) | Compass usage |

## Directory map for agents

| Path | Purpose |
| --- | --- |
| `LAWS.md` | The constitution — binds the standards |
| `docs/standards/` | The individual laws (one file per standard) |
| `AGENTS.md` / `CLAUDE.md` | Agent entry points (this contract) |
| `ai-specs/` | Canonical skills, commands, rules, agents |
| `.claude/` `.cursor/` `.codex/` `.agents/` | IDE mirrors (symlinks into `ai-specs/`) |
| `lawbook/` | Spec-driven workflow: specs, changes, archive |
| `.mcp.json` | MCP wiring (speclaw) |
