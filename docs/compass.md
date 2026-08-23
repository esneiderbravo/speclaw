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
| Many `Grep` + `Read` round-trips (tokens spent scanning) | One `compass_explore` call returns source, callers, callees, blast radius, tests, hotspot |
| Guess which file matters | `compass_find` (mode: concept) finds code by meaning |
| Edit without knowing the blast radius | `include: ["blast_radius"]` on explore, or `compass_diff_context` for a diff |
| Whole files dumped into context | verbatim source of the node + its neighbors only |

The point is token economy: the agent gets exactly the code it needs to answer
a request, not whole files.

## The tools (eight canonical MCP tools)

| Tool | Use it to |
|------|-----------|
| `compass_index` | Build/refresh the graph (`.speclaw/index.db`); optional watch actions (`start`/`stop`/`status`). Schema **8** stores `node_metrics`, test/module flags, drift hashes, and coverage links. |
| `compass_explore` | Read a node's source plus callers, callees, blast radius, affected tests, and hotspot — in one call. Use `to:` for trace-style paths. |
| `compass_find` | Find symbols: `mode: exact` for name/keyword search, `mode: concept` for semantic recall. |
| `compass_diff_context` | Graph context for a change set (working tree, git rev, or explicit paths): symbols touched, blast radius, tests, hotspots. |
| `lawbook_change` | Lawbook lifecycle: init, list, validate, sync, archive, level, coverage, drift. |
| `lawbook_investigate` | Graph-backed bug RCA (stack trace or symptom). |
| `speclaw_setup` | Project setup: init, configure-agent, add-pack, list-packs. |
| `speclaw_check` | Evaluate an action against the laws (hook surface). |

Retired names (`compass_search`, `compass_recall`, `compass_impact`, …) remain
as deprecated aliases for one release cycle. Prefer the canonical tools above.
CLI-only: `speclaw index`, `explore`, `search`, `recall`, `impact`, `trace`,
`affected-tests`, `hotspots`, `coupling`, `diff-context`, `visualize`, `scaffold`,
`doctor`, `laws verify`.

If the graph is missing (no `.speclaw/index.db`), run `compass_index` first —
a missing graph is not license to skip Compass. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

<!-- speclaw:map:start -->
speclaw · 150 files · 558 nodes
src/ (79)  test/ (66)  scripts/ (4)  eslint.config.js/ (1)
hubs: tmpRepo 210 · write 144 · has 89 · parse 61 · openDb 54 · commit 51 · buildIndex 48 · run 39 · read 38 · text 35 · runCli 33 · gitInit 32
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
  `compass_explore runInit` with `to: scaffold`.
- Index build: `runIndex` (`src/cli/commands/index-build.ts`) →
  `compass/indexer.ts` → `parser.ts`/`extract.ts` → `db.ts`.
- MCP tool → work: canonical tools register in each module's `register.ts`,
  validate with Zod, and delegate to the logic file next to it.

**Shared core** (`src/shared/`): `install.ts`, `paths.ts`, `render.ts`,
`agents.ts`, `manifest.ts`, `version.ts`, `mcp.ts` — the innermost layer; use
`compass_explore` with `include: ["blast_radius"]` on any of these before changing
it (wide blast radius).
