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

## Rule 1 — Compass before grep

This repo is indexed by Compass, speclaw's local code graph (`.speclaw/`). Use
the `compass_explore`, `compass_search`, and `compass_recall` tools **BEFORE**
grep/find or reading files at random; run `compass_index` first if the graph
is missing. See [`docs/compass.md`](docs/compass.md). Fall back to Grep/Read
only when the graph doesn't cover what you need.

## Rule 2 — Spec-driven, always

No non-trivial change lands without a spec change (propose → implement →
verify → archive). The rules are in
[`docs/standards/lawbook.md`](docs/standards/lawbook.md);
the workflow skills live in `ai-specs/skills/` and the `/lawbook` commands wrap
them. A change is not done until it is archived — archiving belongs in the PR.

## Rule 3 — Quality gates are non-negotiable

- Tests: `{{test_commands}}`
- Lint / type-check: `{{lint_commands}}`

Run them yourself and report real output. Never claim success you did not
observe. Full rules:
[`docs/standards/testing-standards.md`](docs/standards/testing-standards.md).

## Rule 4 — Conventions

Branches `{{branch_pattern}}`, commits {{commit_style}}, code that reads like
its neighbors, comments that carry constraints (never ticket IDs). Full rules:
[`docs/standards/base-standards.md`](docs/standards/base-standards.md) and
[`docs/standards/conventions.md`](docs/standards/conventions.md).

## Rule 5 — Skills are law-adjacent

Skills, commands, and subagents live in `ai-specs/` (symlinked into
`.claude/`, `.cursor/`, `.codex/`, `.agents/`). When a skill matches the
task, use it — do not improvise a parallel process.

## Rule 6 — Stop conditions

Stop and ask the user before: destructive operations (deletes, force-push,
schema drops), publishing anything outward-facing (PR reviews, tickets,
comments), or any action that contradicts a standard.
