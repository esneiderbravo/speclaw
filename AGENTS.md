# AGENTS.md — speclaw

Operating contract for **every** AI agent (Claude Code, Cursor, Codex, or any
other) working in this repository. These rules are STRICT and non-negotiable.
Claude-specific notes: [`CLAUDE.md`](CLAUDE.md). The law: [`LAWS.md`](LAWS.md).

## Project

- **What it is**: a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project — its own constitution (Foundation), local code graph (Compass), spec-driven workflow (Lawbook), and multi-agent brain (Cortex). 100% local: no LLM, no cloud, no API keys.
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
   first; Claude Code sessions refresh an existing index at start), or the
   target isn't indexed code (stylesheets, config, logs).
   `compass_impact` is grouped by module (`format: flat` escape hatch);
   prefer `compass_affected_tests` / `speclaw affected-tests --from-diff` over
   the full suite. `compass_hotspots` / `speclaw hotspots` ranks activity × AST
   health (default 90 days); `compass_coupling` / `speclaw coupling` reports
   Jaccard strength, `in_graph`, and `isTestPair`. Schema **9** (`embedding_cache`,
   Merkle `dir_hashes`, `node_metrics`) — reindex with `speclaw index` after a
   schema bump (8→9 migrates embeddings). Cheat sheet:
   [`docs/compass.md`](docs/compass.md).
3. **Follow Cortex** (*One brain. Many agents.*) for every non-trivial change;
   archive within the same PR. The primary agent is the **coordinator**
   (`cortex` / `/lawbook/cortex`) — it MUST NOT implement product
   code itself. It dispatches explorer → planner → implementer → reviewer →
   tester → archiver (or adopts each role while obeying that role's
   permission profile). Drive state with the `cortex` MCP tool or
   `speclaw cortex`. Artifact volume follows the confirmed ceremony level
   in `change.json` (0=quick … 3=full); missing `change.json` is level 3.
   Propose, set, or promote with `lawbook_level` / `speclaw lawbook level`;
   level 0 via `speclaw quick`. Bugs: `speclaw lawbook draft --bug`,
   `bugfix.md`, `changeType: bug`; RCA first with `lawbook_investigate`.
   Rules: [`docs/standards/lawbook.md`](docs/standards/lawbook.md).
   Coverage: `speclaw coverage` / `lawbook_coverage`. Drift: `speclaw drift` /
   `lawbook_drift`.
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
6. **Use the skills and role agents.** `ai-specs/` is the canonical home for
   skills, commands, rules, and agents, mirrored to each IDE directory via
   symlinks.
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
| [`docs/cortex.md`](docs/cortex.md) | Cortex multi-agent loop |

## Directory map for agents

| Path | Purpose |
| --- | --- |
| `LAWS.md` | The constitution — binds the standards |
| `docs/standards/` | The individual laws (one file per standard) |
| `docs/compass.md` | Compass cheat sheet |
| `docs/cortex.md` | Cortex multi-agent loop cheat sheet |
| `AGENTS.md` / `CLAUDE.md` | Agent entry points (this contract) |
| `ai-specs/` | Canonical skills, commands, rules, agents |
| `.claude/` `.cursor/` `.codex/` `.agents/` | IDE mirrors (symlinks into `ai-specs/`) |
| `lawbook/` | Spec-driven workflow: specs, changes, archive |
| `lawbook/anchors/` | Sealed spec↔code drift photographs (`speclaw drift`) |
| `speclaw.lock` | Committed rule-file digests (repo root — never under `.speclaw/`) |
| `.mcp.json` | MCP wiring (speclaw) |

## Operator notes

- `speclaw budget` reports always-on context cost. `speclaw init --minimal` /
  `SPECLAW_MINIMAL=1` omit setup MCP tools (no server-side `defer_loading`).
- `speclaw doctor --json` is the support report (redacted by default). Stable
  install: `npx @esneiderbravo/speclaw@latest init`.
- `speclaw update` upgrades itself: when npm reports a newer release it
  re-executes as `npx -y @esneiderbravo/speclaw@<latest> update` (also in CI) and
  that release applies its own migrations. Opt out with `--no-self-update` or
  `SPECLAW_NO_SELF_UPDATE=1`. The agent MCP entry is pinned to the installed
  version (`npx -y @esneiderbravo/speclaw@<version> mcp`); `update` re-pins a
  stock entry and keeps a custom one. Run `speclaw update` so the pinned MCP
  entry moves to 2.0.10; an older speclaw opening this index rebuilds it from
  scratch.
- Optional `.speclaw/affected.json` overrides affected-test globals/test globs.
  Affected-test `command` may be `null` (with `commandReason`) when no test is
  reachable; `commands[]` lists one `{ cwd, command, files }` per package — never
  run `command` blindly.
  Compass schema **11** (`node_text` / FTS5 / `pagerank` + embedding cache) — reindex
  with `speclaw index` (10→11 forces a reindex; embeddings reused); photograph bodies once with
  `speclaw drift --reseal` if anchors are new or stale. Hotspots/coupling default
  history window is 90 days.
- Ceremony 0–3 in `change.json`; `speclaw quick` for level 0; `lawbook_level`
  propose/set/promote. Optional `ceremony:` in `lawbook/config.yaml`.
- Bugs: `speclaw lawbook draft --bug`, `bugfix.md`, `lawbook_investigate`.
- Laws dialects: `speclaw laws compile` (AGENTS/CLAUDE blocks + `ai-specs/rules`);
  `speclaw laws import --from rulesync` (draft laws do not gate verify).
- **`speclaw.lock`** lives at the repo root (never under `.speclaw/`).
  `speclaw laws lock` / `accept` / `scan`; digest **accept** is interactive TTY
  only — never via MCP. `speclaw verify` folds integrity findings with
  deps/graph. Strict paths: `AGENTS.md` / `CLAUDE.md` / compiled rules;
  standards docs are advisory.
  A lock refresh (init/update/`laws compile`/`laws lock`) never re-baselines a
  strict file edited outside speclaw: it keeps the locked digest and warns `run
  speclaw laws accept <path>`; `speclaw laws lock --force` re-baselines on an
  interactive TTY only.
- Optional `team.owners` in `lawbook/config.yaml` maps capabilities (and `"*"`)
  to `@user` / `@org/team` / email. `speclaw owners --write` compiles a managed
  block at the **end** of `.github/CODEOWNERS` (GitHub: last match wins; CLI
  only — no MCP tool). `speclaw doctor` errors if content appears after the end
  marker. `deriveFromTraceability` is not enabled in this release.
- Compass-first (2.0.4): `compassGate: off|warn|strict` in `lawbook/config.yaml`
  (default `warn`) gates the Cortex `exploring` and `implementing` stages on
  Compass calls logged to `.speclaw/compass-calls.jsonl`. A PostToolUse
  `Read|Grep|Glob` hook adds a Compass-first nudge as context only — never a
  permission decision. `compass_index` returns totals plus a `nextStep`.
- Session-start refresh (2.0.7): for Claude Code, `init` / `update` add one
  `SessionStart` command hook that runs `speclaw session-start`
  (local `node_modules/.bin` → `PATH` → offline `npx --no-install`; silent,
  always exit 0, 30 s timeout; an older speclaw rejects the unknown command). It skips when `.speclaw/index.db` is absent, so the
  first build stays `compass_index` / `speclaw index`. An unchanged project
  takes the no-op fast path and leaves `docs/compass.md` alone. Existing
  installs see the settings file as `refreshedDiverged` once on `update`.
  Each Write/Edit is re-indexed right after the edit (a `PostToolUse`
  `Write|Edit|MultiEdit|NotebookEdit` hook, timeout 10, hands the file to
  `speclaw reindex-file` in a detached background process: silent, always exit
  0, skipped when `.speclaw/index.db` is absent, never downloads). PageRank and
  the compact map in `docs/compass.md` catch up on the next full run; files
  created or renamed by shell commands and edits by agents without hooks are
  picked up at the next session start or `compass_index`.
- `speclaw lawbook draft <name> [--level N] [--capability C]` (or
  `lawbook_change` action `draft`) scaffolds a change. Existing installs show
  the updated hooks as `refreshedDiverged` on `speclaw update`.
- speclaw **2.0** is the official release: Foundation (hooks + `speclaw.lock`),
  Compass (schema 11), Lawbook (ceremony 0–3, coverage, drift, bugfix),
  Cortex (multi-agent loop; nine canonical MCP tools including `cortex`),
  Team (`team.owners` → `speclaw owners --write`).
  Install: `npx @esneiderbravo/speclaw@latest init`. CI consumers:
  `esneiderbravo/speclaw@v2`.

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
