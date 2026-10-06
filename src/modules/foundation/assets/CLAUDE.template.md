# CLAUDE.md — {{project_name}} Agent Operating Rules

Agent rules for the **{{project_name}}** repository ({{project_description}}).
These rules are STRICT. Read this file at the start of every session.
Cross-agent context: [`AGENTS.md`](AGENTS.md) · The law: [`LAWS.md`](LAWS.md)

---

## Rule 0 — The Law comes first

Read [`LAWS.md`](LAWS.md) before writing or changing any code. It is the
constitution: it binds the individual standards below. Open the standard that
governs the area you're touching **before** touching it:

| You're working on… | Read first |
|--------------------|-----------|
| Anything | [`docs/standards/base-standards.md`](docs/standards/base-standards.md) |
| Structure / boundaries | [`docs/standards/architecture.md`](docs/standards/architecture.md) |
| Backend code | [`docs/standards/backend-standards.md`](docs/standards/backend-standards.md) |
| Frontend code | [`docs/standards/frontend-standards.md`](docs/standards/frontend-standards.md) |
| Tests / gates | [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md) |
| Docstrings / API comments | [`docs/standards/documentation.md`](docs/standards/documentation.md) |
| Branches / PRs / tickets | [`docs/standards/conventions.md`](docs/standards/conventions.md) |
| Any non-trivial change | [`docs/standards/lawbook.md`](docs/standards/lawbook.md) |

When any instruction conflicts with a standard, **the standard wins** — and if
you believe it is wrong, propose an amendment via a spec change; never silently
ignore it.

## Rule 1 — Compass first, always

This repo is indexed by Compass, speclaw's local code graph (`.speclaw/`). For
**any** question about code — what a symbol is, what it uses, who calls it,
where it lives, how a value flows — call Compass **first**: `compass_find` to
locate, `compass_explore` to read a symbol with its callers and callees (include
`blast_radius` for what could break, `to` for a call path), and
`compass_diff_context` for the context of a diff.
Run `compass_index` first if the graph is missing.

This includes files you already know the name of: to learn what `Foo` imports,
uses, or depends on, run `compass_explore Foo` — do **not** `cat`/`sed`/`grep`/
Read the file to work it out by hand. "I know which file it is" is not an
exemption.

Fall back to Grep / Read / `sed` / `cat` **only after** you can name which of
these holds: (1) a Compass call actually ran and returned nothing useful for the
query, (2) the graph is missing and `compass_index` can't be run, or (3) the
target is not indexed code — stylesheets, JSON/config, markdown, logs,
generated files, lockfiles. Never skip Compass because grep "feels faster."
See [`docs/compass.md`](docs/compass.md).

## Rule 2 — Spec-driven Cortex loop, always

No non-trivial change lands without a lawbook change (propose → implement →
verify → archive) run through **Cortex** (*One brain. Many agents.*). You are the
**coordinator** unless you were spawned as a role agent: use the `cortex`
skill / `/lawbook/cortex` and the `cortex` MCP tool; do **not** implement product code yourself.
Role agents live in `ai-specs/agents/`. The rules are in
[`docs/standards/lawbook.md`](docs/standards/lawbook.md);
workflow skills live in `ai-specs/skills/` and `/lawbook` commands wrap them.
A change is not done until it is archived — archiving belongs in the PR.

## Rule 3 — Quality gates are non-negotiable

- Tests: `{{test_commands}}`
- Lint / type-check: `{{lint_commands}}`

The **tester** role runs them and reports real output. Never claim success you
did not observe. Full rules:
[`docs/standards/testing-standards.md`](docs/standards/testing-standards.md).

## Rule 4 — Conventions

Branches `{{branch_pattern}}`, commits {{commit_style}}, code that reads like
its neighbors, comments that carry constraints (never ticket IDs). Full rules:
[`docs/standards/base-standards.md`](docs/standards/base-standards.md) and
[`docs/standards/conventions.md`](docs/standards/conventions.md).

## Rule 5 — Skills and role agents are law-adjacent

Skills, commands, rules, and agents live in `ai-specs/` (symlinked into
`.claude/`, `.cursor/`, `.codex/`, `.agents/`). When a skill or role matches
the task, use it — do not improvise a parallel process.

## Rule 6 — Stop conditions

Stop and ask the user before: destructive operations (deletes, force-push,
schema drops), writing to a real data store (DB rows or files holding real user
data — including to set up or tear down test data; verification runs against an
isolated/throwaway store instead), publishing anything outward-facing (PR
reviews, tickets, comments), or any action that contradicts a standard.
Planner clarifying questions always go to the human via the coordinator.
