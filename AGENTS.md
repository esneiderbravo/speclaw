# AGENTS.md — speclaw

Operating contract for **every** AI agent (Claude Code, Cursor, Codex, or any
other) working in this repository. These rules are STRICT and non-negotiable.
Claude-specific notes: [`CLAUDE.md`](CLAUDE.md). The law: [`LAWS.md`](LAWS.md).

## Project

- **What it is**: a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project — its own constitution (Foundation), local code graph (Compass), and spec-driven workflow (Lawbook). 100% local: no LLM, no cloud, no API keys.
- **Organization**: Esneider Bravo · open source (MIT)
- **Stack**: TypeScript (ES2022, ESM, Node16 resolution) on Node.js ≥22 · MCP server (`@modelcontextprotocol/sdk`) + Clack CLI · tree-sitter (WASM) parsing · `node:sqlite` code graph · Zod schemas. No frontend, no service, no LLM.

## Mandatory operating rules

1. **Read [`LAWS.md`](LAWS.md) first.** It is the constitution; it binds the
   standards below. Open the standard that governs your change before making
   it. Conflicts resolve in favor of the standard; amendments go through a
   spec change, never silent deviation.
2. **Compass first, always** — for any code question call `compass_explore` /
   `compass_search` / `compass_recall` **before** any grep/sed/cat/Read,
   including files you already know by name. Fall back to manual file tools only
   after Compass returns nothing useful, the graph is missing (`compass_index`
   first), or the target isn't indexed code (stylesheets, config, logs). Cheat
   sheet: [`docs/compass.md`](docs/compass.md).
3. **Follow the lawbook workflow** for every non-trivial change; archive
   within the same PR. Rules:
   [`docs/standards/lawbook.md`](docs/standards/lawbook.md).
4. **Run the quality gates yourself** before declaring anything done — see
   [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md):
   - Lint + format: `npm run check` (Prettier `--check` + ESLint); `npm run format` to fix
   - Type-check + compile: `npm run build` (strict `tsc` + asset copy)
   - Tests: no unit-test runner yet — the gates above are the compile-time gates;
     add `node:test` coverage with new behavior, and verify runtime by exercising
     the CLI (e.g. `node dist/cli/index.js …`).
5. **Respect the conventions** — branches `<type>/<short-slug>` (no ticket
   prefix), Conventional Commits (`type(scope): imperative summary`, English,
   lowercase), code that reads like its neighbors. See
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
