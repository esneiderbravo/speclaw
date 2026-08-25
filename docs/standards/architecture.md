# Architecture — speclaw

The structural law of the project. Every change respects these boundaries —
see [`../../LAWS.md`](../../LAWS.md). Use `compass_explore` to navigate the
real code before editing.

- **Overall shape**: a single TypeScript package with **two transports — a CLI
  and an MCP server — over one shared core**. Feature modules
  (`foundation`, `compass`, `lawbook`, `tools`) each self-register their tools;
  adding a module is one line in `buildServer` (`src/server.ts`).
- **Stack**: TypeScript (ES2022, ESM, Node16 resolution) on Node.js ≥22 · MCP
  server (`@modelcontextprotocol/sdk`) + Clack CLI · tree-sitter (WASM) parsing ·
  `node:sqlite` code graph · Zod tool schemas. No frontend, no service, no LLM.

## Modules / bounded contexts

Each module owns one capability and exposes it through both transports. Modules
live under `src/modules/*`; the CLI (`src/cli/*`) and shared core
(`src/shared/*`) are the surrounding layers.

| Module | Path | Responsibility |
|--------|------|----------------|
| foundation | `src/modules/foundation/` | Analyze a repo and scaffold its constitution: `LAWS.md`, `docs/standards/*`, `CLAUDE.md`/`AGENTS.md`, `docs/compass.md`, plus `doctor` health checks, deterministic law verification (`deps`/`graph`), and rule-file integrity (`speclaw.lock` digests + injection scan via `verifyIntegrity`). Tools: `init_project`, `scaffold`, `configure_agent`, `doctor`, `speclaw_check`, `law_verify`. |
| compass | `src/modules/compass/` | The local code graph: tree-sitter parse → extract → `node:sqlite` index, semantic recall, impact/trace, interactive visualize, and a file watcher. Tools: `compass_index`/`explore`/`search`/`recall`/`impact`/`trace`/`watch`. |
| lawbook | `src/modules/lawbook/` | The spec-driven workflow engine over `lawbook/`: init, validate, sync, archive, list. Tools: `lawbook_init`/`validate`/`sync`/`archive`/`list`. |
| tools | `src/modules/tools/` | Opt-in skill/agent packs (currently the dev-agents). Tools: `list_packs`, `add_pack`. |
| cli | `src/cli/` | The terminal surface over the same capabilities: `init`, `update`, `agent`, `index`/`watch`, `explore`/`search`/`recall`/`impact`/`trace`, `visualize`, `lawbook …`, `doctor`, `check`, `laws verify|lock|accept|scan`, `verify`, `mcp`. |
| shared | `src/shared/` | Cross-cutting core: filesystem install, path resolution, template render, agent configuration + symlinks, manifest, version/update check, the MCP `text()` result helper. |

## Layering — strictly enforced

Two transports, one core. A capability is implemented **once** in a module and
surfaced through both the CLI command and the MCP `register.ts`; never fork the
logic between them.

| Layer | Location | May depend on | Rules |
|-------|----------|---------------|-------|
| Entrypoints | `src/server.ts`, `src/cli/index.ts` | modules, shared | Wire the MCP server / dispatch CLI commands. No business logic. |
| CLI commands | `src/cli/commands/*.ts` | `src/cli/lib`, modules, shared | One file per command: parse flags, render terminal UI, delegate. Thin. |
| CLI lib | `src/cli/lib/*.ts` | shared | Arg parsing, Clack UI, update check. Presentation helpers only. |
| Tool registration | `src/modules/*/register.ts` | that module's logic, shared | The MCP transport boundary: Zod-validate inputs, wrap results with `text()`, delegate. No business logic inline. |
| Module logic | `src/modules/*/{scaffold,doctor,engine,indexer,parser,extract,query,visualize,…}.ts` | shared, another module's public exports | The actual work. I/O is isolated here, not in the transport. |
| Shared core | `src/shared/*.ts` | (nothing internal) | Innermost layer. Must not import from `modules/` or `cli/`. |

- Dependencies point inward: entrypoints → CLI/registration → module logic →
  shared. `shared/` never imports a module or the CLI.
- Modules may reuse another module's **exported** helper (e.g. `foundation`
  uses `tools`' `loadPacks`), but there are no circular dependencies.
- The transport boundary (`register.ts` and CLI command handlers) stays thin —
  validation and result-shaping only. Business logic belongs in module logic.

## Cross-boundary rules

- Dependencies point inward: outer layers depend on inner, never the reverse.
- Business logic never leaks into a transport (MCP `register.ts`, CLI command)
  or into persistence (`compass/db.ts`).
- A change that crosses a module boundary — or adds/renames an MCP tool or CLI
  command — needs a spec change describing the new contract.
