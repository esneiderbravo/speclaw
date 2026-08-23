# Compass — code intelligence for agents in speclaw

**Compass** is speclaw's local code graph: a pre-indexed map of every symbol
(node) and relationship (edge) in this workspace, plus a local vector store for
semantic recall. Agents **MUST** call Compass first for any code question —
before any `grep`/`sed`/`cat`/Read, and before opening a file whose name they
already know. Manual file tools are a fallback used **only after** a Compass
call returns nothing useful, the graph is missing, or the target isn't indexed
code (stylesheets, config, logs). This is Rule 1 of the agent contract
(`AGENTS.md`).

It runs entirely on your machine, needs no LLM and no external service, and
stores everything in `.speclaw/` (gitignored). It ships inside speclaw — there
is nothing extra to install.

## Why use it

| Without Compass | With Compass |
|-----------------|--------------|
| Many `Grep` + `Read` round-trips (tokens spent scanning) | One `compass_explore` call returns just the relevant node |
| Guess which file matters | `compass_recall` finds code by meaning |
| Edit without knowing the blast radius | callers/callees returned with the node |
| Whole files dumped into context | verbatim source of the node + its neighbors only |

The point is token economy: the agent gets exactly the code it needs to answer
a request, not whole files.

## The tools

| Tool | Use it to |
|------|-----------|
| `compass_index` | Build/refresh the graph (`.speclaw/index.db`). Incremental — unchanged files are skipped by hash. Run once after init and after significant edits. |
| `compass_explore` | Read a node's verbatim source plus its callers and callees. The default before editing. |
| `compass_search` | Structural search: find nodes by name/keyword. |
| `compass_recall` | Semantic search: describe what you want in natural language and get nodes ranked by meaning. |
| `compass_impact` | Blast radius: every node that transitively calls a target — "what could break if I change this?" before editing. |
| `compass_trace` | Trace a call path between two nodes — how an entrypoint reaches a sink. |
| `compass_watch` | Keep the index fresh automatically (start/stop a debounced incremental re-index on file change). |

If the graph is missing (no `.speclaw/index.db`), run `compass_index` first —
a missing graph is not license to skip Compass. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

<!-- speclaw:map:start -->
speclaw · 124 files · 381 nodes
src/ (66)  test/ (53)  scripts/ (4)  eslint.config.js/ (1)
hubs: tmpRepo 168 · write 68 · has 67 · parse 49 · commit 38 · read 37 · runCli 33 · run 28 · openDb 28 · emptyReport 28 · sampleProfile 26 · gitInit 26
entry: src/server.ts (mcp) · src/cli/index.ts (bin)
<!-- speclaw:map:end -->

## Project-specific starting points

**Entrypoints**

- `buildServer` (`src/server.ts`) — the MCP server: registers every module's
  tools. `compass_explore buildServer` shows what each module contributes.
- `dispatch` (`src/cli/index.ts`) — the CLI router: maps a command to its
  handler via lazy `import()`. Start here to find any command's code.

**Module surfaces** — each module's public boundary is its `register.ts`; the
logic sits beside it:

- foundation: `scaffold` (`src/modules/foundation/scaffold.ts`),
  `doctor` (`doctor.ts`)
- compass: `parser.ts` → `extract.ts` → `indexer.ts` → `db.ts` (`node:sqlite`),
  with `embedder.ts` (recall), `query.ts` (explore/search/impact/trace),
  `visualize.ts`, `watcher.ts`
- lawbook: `engine.ts` (init/validate/sync/archive/list)
- tools: `packs.ts` (`loadPacks`), `register.ts`

**Common traces**

- CLI → core: `runInit` (`src/cli/commands/init.ts`) → `scaffold` →
  `shared/install` + `shared/render` + `shared/agents`. Try
  `compass_trace runInit scaffold`.
- Index build: `runIndex` (`src/cli/commands/index-build.ts`) →
  `compass/indexer.ts` → `parser.ts`/`extract.ts` → `db.ts`.
- MCP tool → work: any `*_*` tool is registered in a module's `register.ts`,
  which validates with Zod and delegates to the logic file next to it.

**Shared core** (`src/shared/`): `install.ts`, `paths.ts`, `render.ts`,
`agents.ts`, `manifest.ts`, `version.ts`, `mcp.ts` — the innermost layer; use
`compass_impact` on any of these before changing it (wide blast radius).

