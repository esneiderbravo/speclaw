# AGENTS.md — speclaw

Operating contract for **every** AI agent (Claude Code, Cursor, Codex, or any
other) working in this repository. These rules are STRICT and non-negotiable.
Claude-specific notes: [`CLAUDE.md`](CLAUDE.md). The law: [`LAWS.md`](LAWS.md).

## Project

- **What it is**: a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project — its own constitution (Foundation), local code graph (Compass), and spec-driven workflow (Lawbook). 100% local: no LLM, no cloud, no API keys.
- **Organization**: Esneider Bravo · open source (MIT)
- **Stack**: TypeScript (ES2022, ESM, Node16 resolution) on Node.js ≥22.16 · MCP server (`@modelcontextprotocol/sdk`) + Clack CLI · tree-sitter (WASM) parsing · `node:sqlite` code graph · Zod schemas. No frontend, no service, no LLM.

## Mandatory operating rules

1. **Read [`LAWS.md`](LAWS.md) first.** It is the constitution; it binds the
   standards below. Open the standard that governs your change before making
   it. Conflicts resolve in favor of the standard; amendments go through a
   spec change, never silent deviation.
2. **Compass first, always** — for any code question call `compass_explore` /
   `compass_find` / `compass_explore` **before** any grep/sed/cat/Read,
   including files you already know by name. Fall back to manual file tools only
   after Compass returns nothing useful, the graph is missing (`compass_index`
   first), or the target isn't indexed code (stylesheets, config, logs).
   `compass_impact` is grouped by module (`format: flat` escape hatch);
   prefer `compass_affected_tests` / `speclaw affected-tests --from-diff` over
   the full suite. `compass_hotspots` / `speclaw hotspots` ranks activity × AST
   health (default 90 days); `compass_coupling` / `speclaw coupling` reports
   Jaccard strength, `in_graph`, and `isTestPair`. Schema **9** (`embedding_cache`,
   Merkle `dir_hashes`, `node_metrics`) — reindex with `speclaw index` after a
   schema bump (8→9 migrates embeddings). Cheat sheet:
   [`docs/compass.md`](docs/compass.md).
3. **Follow the lawbook workflow** for every non-trivial change; archive
   within the same PR. Artifact volume follows the confirmed ceremony level in
   `change.json` (0=quick … 3=full); missing `change.json` is level 3. Propose,
   set, or promote with `lawbook_level` / `speclaw lawbook level`; level 0 via
   `speclaw quick`. Bugs: `speclaw lawbook draft --bug`, `bugfix.md` (repro +
   regression + prevention), `changeType: bug`; RCA first with
   `lawbook_investigate` / the investigate skill. Feature ceremony unchanged;
   security-withheld mode is not shipped. Rules:
   [`docs/standards/lawbook.md`](docs/standards/lawbook.md).
   Coverage: `speclaw coverage` / `lawbook_coverage` (ids like `req~name~1`,
   `// Covers:` comments). Drift: `speclaw drift` / `lawbook_drift` (committed
   `lawbook/anchors/*.json`, dual body/norm hashes).
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
7. **Ask before irreversible or outward-facing actions** — destructive commands;
   writing to a real data store (DB rows or files with real user data, including
   for tests — verify against an isolated/throwaway store); publishing
   reviews/tickets/comments.

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
| `lawbook/anchors/` | Sealed spec↔code drift photographs (`speclaw drift`) |
| `.mcp.json` | MCP wiring (speclaw) |

## Operator notes

- `speclaw budget` reports always-on context cost. `speclaw init --minimal` /
  `SPECLAW_MINIMAL=1` omit setup MCP tools (no server-side `defer_loading`).
- `speclaw doctor --json` is the support report (redacted by default). Stable
  install: `npx @esneiderbravo/speclaw@latest init`.
- Optional `.speclaw/affected.json` overrides affected-test globals/test globs.
  Compass schema **10** (`node_text` / FTS5 / `pagerank` + embedding cache from 9) — reindex
  with `speclaw index` (9→10 preserves embeddings); photograph bodies once with
  `speclaw drift --reseal` if anchors are new or stale. Hotspots/coupling default
  history window is 90 days.
- Ceremony 0–3 in `change.json`; `speclaw quick` for level 0; `lawbook_level`
  propose/set/promote. Optional `ceremony:` in `lawbook/config.yaml`.
- Bugs: `speclaw lawbook draft --bug`, `bugfix.md`, `lawbook_investigate`.
- Laws dialects: `speclaw laws compile` (AGENTS/CLAUDE blocks + `ai-specs/rules`);
  `speclaw laws import --from rulesync` (draft laws do not gate verify).
