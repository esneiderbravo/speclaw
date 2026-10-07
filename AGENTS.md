# AGENTS.md — speclaw

Operating contract for **every** AI agent (Claude Code, Cursor, Codex, or any
other) working in this repository. These rules are STRICT and non-negotiable.
Claude-specific notes: [`CLAUDE.md`](CLAUDE.md). The law: [`LAWS.md`](LAWS.md).

## Project

- **What it is**: a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project — Foundation, Compass, Lawbook, Cortex; 100% local
- **Organization**: Esneider Bravo · open source (MIT)
- **Stack**: TypeScript (ESM) on Node.js ≥22.16 · MCP server + Clack CLI · tree-sitter (WASM) · `node:sqlite` · Zod

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
   why>"` as your last step on agents without hooks — records the change, runs
   the gates once, writes the report from their real output, and archives
   level-0 work. Review happens on the PR and never blocks the agent. Add
   agents only to run three or more large, independent parts in parallel.
   Details: the `cortex` skill and
   [`docs/standards/lawbook.md`](docs/standards/lawbook.md).
4. **Run the quality gates yourself** before declaring anything done — see
   [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md):
   - Tests: `npm run build && npm test`
   - Lint / type-check: `npm run check && npm run build`
5. **Respect the conventions** — branches `<type>/<short-slug>`, commits
   Conventional Commits (`type(scope): imperative summary`, English, lowercase), code that reads like its neighbors. See
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

<!-- speclaw:laws:start -->
## speclaw laws (generated)

_Edit `docs/standards/*.md` or `.speclaw/laws-manifest.json`; do not edit this block._

## Scoped rules

### No circular module dependencies (`law~no-module-cycles~1`)

In files that match `src/modules/**`, `!**/*.{spec,test}.{ts,tsx,js,jsx}`, `!**/test/**`, `!**/__tests__/**`, There are no circular dependencies between modules.

### No secrets in the repository (`law~no-secrets-in-repo~1`)

In files that match `**/.env`, `**/.env.*`, `**/*.env`, Never write a .env file into the repository. Secrets live in the environment, not in version control.

### Protect the templates (`law~protect-templates~1`)

In files that match `src/modules/*/assets/**`, Assets under src/modules/*/assets/** are product output — keep the {{placeholder}} and speclaw-init contracts intact, and let the build copy them (never hand-copy into dist/).

## Rules for `ATTRIBUTION.md`

### Keep attribution honest (`law~honest-attribution~1`)

In files that match `ATTRIBUTION.md`, Keep ATTRIBUTION.md accurate as the Compass and Lawbook modules evolve.

## Rules for `package.json`

### Local-first is non-negotiable (`law~local-first~1`)

In files that match `package.json`, Justify any new dependency in the PR: it must not break 'runs offline with no API keys'.

## Rules for `src/modules/compass`

### Compass does not import foundation (`law~compass-does-not-import-foundation~1`)

In files that match `src/modules/compass/**`, src/modules/compass must not import from src/modules/foundation.

## Rules for `src/shared`

### shared stays the innermost layer (`law~shared-stays-inner~1`)

In files that match `src/shared/**`, src/shared must not import from src/modules or src/cli.
<!-- speclaw:laws:end -->
