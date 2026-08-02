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
2. **Use Compass before file scanning** — the `compass_explore` /
   `compass_search` / `compass_recall` tools (run `compass_index` first if the
   graph is missing). Cheat sheet: [`docs/compass.md`](docs/compass.md).
3. **Follow the spec workflow** for every non-trivial change; archive
   within the same PR. Rules:
   [`docs/standards/spec-workflow.md`](docs/standards/spec-workflow.md).
4. **Run the quality gates yourself** before declaring anything done — see
   [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md):
   - Tests: `{{test_commands}}`
   - Lint / type-check: `{{lint_commands}}`
5. **Respect the conventions** — branches `{{branch_pattern}}`, commits
   {{commit_style}}, code that reads like its neighbors. See
   [`docs/standards/base-standards.md`](docs/standards/base-standards.md) and
   [`docs/standards/conventions.md`](docs/standards/conventions.md).
6. **Use the skills.** `ai-specs/` is the canonical home for skills, commands,
   and subagents, mirrored to each IDE directory via symlinks.
7. **Ask before irreversible or outward-facing actions.**

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
| [`docs/standards/spec-workflow.md`](docs/standards/spec-workflow.md) | Spec-driven workflow, archiving |
| [`docs/compass.md`](docs/compass.md) | Compass usage |

## Directory map for agents

| Path | Purpose |
| --- | --- |
| `LAWS.md` | The constitution — binds the standards |
| `docs/standards/` | The individual laws (one file per standard) |
| `AGENTS.md` / `CLAUDE.md` | Agent entry points (this contract) |
| `ai-specs/` | Canonical skills, commands, rules, agents |
| `.claude/` `.cursor/` `.codex/` `.agents/` | IDE mirrors (symlinks into `ai-specs/`) |
| `spec/` | Spec-driven workflow: specs, changes, archive |
| `.mcp.json` | MCP wiring (speclaw) |
