# Architecture — speclaw

The structural law of the project. Every change respects these boundaries —
see [`../../LAWS.md`](../../LAWS.md). Use `compass_explore` to navigate the
real code before editing.

- **Overall shape**: a single TypeScript package with **two transports — a CLI
  (`src/cli/index.ts`, the `speclaw` bin) and an MCP server (`src/server.ts`) —
  over one shared core**. Feature modules (`foundation`, `lawbook`, `compass`,
  `cortex`, `tools`) each self-register their MCP tools; adding a module is one
  line in `buildServer` (`src/server.ts`).
- **Stack**: TypeScript (ES2022, ESM, Node16 resolution) on Node.js ≥22.16 · MCP
  server (`@modelcontextprotocol/sdk`) + Clack CLI · tree-sitter (WASM) parsing ·
  `node:sqlite` code graph · Zod tool schemas. No frontend, no service, no LLM.

## Modules / bounded contexts

Each module owns one capability. Modules live under `src/modules/*`; the CLI
(`src/cli/*`) and shared core (`src/shared/*`) are the surrounding layers.

| Module | Path | Responsibility |
|--------|------|----------------|
| foundation | `src/modules/foundation/` | Scaffold a repo's constitution (`LAWS.md`, `docs/standards/*`, `CLAUDE.md`/`AGENTS.md`, `docs/compass.md`), compile laws (`laws-manifest.json` → generated rules), agent hooks, `doctor`, deterministic law verification (`deps`/`graph`), rule-file integrity (`speclaw.lock` + injection scan), SARIF/markdown reports. MCP: `speclaw_setup`, `speclaw_check`, `configure_agent`, `list_packs`, `add_pack`, `init_project` (deprecated alias). |
| compass | `src/modules/compass/` | The local code graph: tree-sitter parse → extract → `node:sqlite` index (`db.ts`), hybrid BM25/vector/name retrieval, PageRank, git-history hotspots/coupling, impact/trace, affected tests, diff context, visualizer, watcher. MCP: `compass_index`/`find`/`explore`/`search`/`recall`/`impact`/`trace`/`diff_context`/`hotspots`/`coupling`/`affected_tests`/`watch`. |
| lawbook | `src/modules/lawbook/` | The spec-driven workflow engine over `lawbook/`: init, validate, sync, archive, list, ceremony levels, EARS lint, requirement coverage, spec drift/anchors, bugfix investigation, `quick`/`ship`. MCP: `lawbook_*`, `lawbook_change`, `lawbook_investigate`. |
| cortex | `src/modules/cortex/` | **Cortex** — One brain. Many agents. Durable multi-agent loop (`harness.json`), stage briefs, Compass-first evidence gate, status. MCP: `cortex`. Must not import lawbook (reads `change.json` locally). |
| team | `src/modules/team/` | Compile declared `team.owners` into a managed trailing `CODEOWNERS` block (`speclaw owners`). CLI-only — no MCP tool. |
| tools | `src/modules/tools/` | Opt-in skill/agent packs (catalog may be empty), exposed through `list_packs`/`add_pack`. |
| cli | `src/cli/` | The terminal surface: one file per command in `src/cli/commands/` (`init`, `update`, `agent`, `index`, `query`, `visualize`, `lawbook`, `quick`, `ship`, `cortex`, `coverage`, `drift`, `doctor`, `owners`, `check`, `laws`, `verify`, `budget`, hook entrypoints `session-start`/`reindex-file`/`ship-on-stop`, …). |
| shared | `src/shared/` | Cross-cutting core: install/gitignore, paths, template render, agent config + symlinks + MCP entry, manifest, version, git + git-history, token/output budgets, tool catalog/exposure, redaction, the MCP `text()` helper. |

## Layering — strictly enforced

Two transports, one core. A capability is implemented **once** in a module and
surfaced through a thin CLI command and/or a thin MCP `register.ts`; never fork
the logic between them.

| Layer | Location | May depend on | Rules |
|-------|----------|---------------|-------|
| Entrypoints | `src/server.ts`, `src/cli/index.ts` | modules, shared, CLI lib | Wire the MCP server / dispatch CLI commands (lazy `import()`). No business logic. |
| CLI commands | `src/cli/commands/*.ts` | `src/cli/lib`, modules, shared | One file per command: parse flags, render terminal UI, delegate. Thin. |
| CLI lib | `src/cli/lib/*.ts` | shared | Arg parsing, Clack UI, help, update/self-update. Presentation helpers only. |
| Tool registration | `src/modules/*/register*.ts` | that module's logic, shared | The MCP transport boundary: Zod-validate inputs, wrap results with `text()`, delegate. No business logic inline. |
| Module logic | `src/modules/*/*.ts` | shared, another module's exported helpers (see below) | The actual work. I/O is isolated here, not in the transport. |
| Shared core | `src/shared/*.ts` | nothing internal | Innermost layer. Must not import from `modules/` or `cli/` (`law~shared-stays-inner~1`). |

Allowed module-to-module dependencies, as the code stands today:

| Module | May import from |
|--------|-----------------|
| compass | shared only — never foundation (`law~compass-does-not-import-foundation~1`) |
| cortex | shared only — never lawbook |
| tools, team | shared only |
| lawbook | shared, compass, cortex |
| foundation | shared, compass, lawbook, cortex, tools, team (it composes the others) |

- Dependencies point inward: entrypoints → CLI/registration → module logic →
  shared. There are no circular dependencies between modules
  (`law~no-module-cycles~1`) — a new edge that would close a cycle is rejected.
- The transport boundary (`register.ts` and CLI command handlers) stays thin —
  validation and result-shaping only.

## Cross-boundary rules

- Dependencies point inward: outer layers depend on inner, never the reverse.
- Business logic never leaks into a transport (MCP `register.ts`, CLI command)
  or into persistence (`compass/db.ts` owns opening and migrating the index;
  other modules only receive a `DatabaseSync` handle).
- A change that crosses a module boundary — or adds/renames an MCP tool or CLI
  command — needs a spec change describing the new contract, and the tool
  surface budget (`token-budget.json`, `speclaw budget`) must still pass.
