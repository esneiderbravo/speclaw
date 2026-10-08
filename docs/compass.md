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
| Guess which file matters | `compass_find` finds code by name or meaning |
| Edit without knowing the blast radius | callers/callees returned with the node |
| Whole files dumped into context | verbatim source of the node + its neighbors only |

The point is token economy: the agent gets exactly the code it needs to answer
a request, not whole files.

## The tools

| Tool | Use it to |
|------|-----------|
| `compass_index` | Build/refresh the graph (`.speclaw/index.db`). Incremental — unchanged files are skipped by hash. Run once after init and after significant edits. |
| `compass_find` | Find code: `mode: exact` by exact name (one or more identifiers; a missing name returns `found: false` and up to five `nearest` names), `mode: concept` by meaning in natural language. Returns compact hits (`name`, `kind`, `file`, `line`) in one JSON document that fits `maxTokens` (default 1500); `truncated: true` only when it trimmed. |
| `compass_explore` | Read a node's verbatim source plus its callers and callees. The default before editing. Add `include: ["blast_radius"]` for what could break, or `to: <symbol>` for the call path between two nodes. |
| `compass_diff_context` | Symbols, blast radius, and tests for a diff (working tree or a rev). |

Callees list only references resolved to a project symbol; the rest are counted
in `unresolvedCallees`. A call inside a test callback or a top-level import
shows up as a caller of kind `file`, so tests written as bare `test(...)`
blocks are still selected. The affected-test `command` is `null` (with
`commandReason`) when no test is reachable; otherwise run it from the repository
root, or use `commands` (one `{ cwd, command, files }` per package, with the
runner detected from each `package.json`: vitest, jest, or `node --test`).
Method calls on local variables and parameters (`svc.run()`) are not bound to a
project method, so they do not appear as callers. Calls through an imported
re-export barrel (`index.ts` holding `export * from "./lib/core"`) bind by
name, preferring a definition under the barrel's directory.

Explore callers carry `via`: `call` for calls, `ref` for type references
(annotations and `extends`/`implements` clauses that resolve through the file's
own import or a same-file definition). Type references never change blast
radius, affected tests, or ranking. `compass_find` keeps only indexed files in
`focus` and lists the others in `focusIgnored`.

Compass uses index schema 12 (11→12 forces one reindex; embeddings reused).
speclaw 2.0.12 or older, including an MCP entry pinned at `@2.0.12`, rebuilds a
schema-12 index from scratch (losing the embedding cache). Pin every speclaw to
2.0.13: run `speclaw update` so the pinned MCP entry moves to 2.0.13.

`compass_index` also takes `action: start|stop|status` to keep the index fresh
automatically (a debounced incremental re-index on file change).

Under Claude Code, a `SessionStart` hook refreshes an existing index when each
session starts (`speclaw session-start`: silent, never fails, skips
when `.speclaw/index.db` is absent, and leaves this file alone when nothing
changed). A `PostToolUse` hook re-indexes each file the agent writes or edits
right after the edit (`speclaw reindex-file`: detached, silent, never fails);
PageRank and this file's map catch up on the next full run. Files created or
renamed by shell commands, and edits by agents without hooks, are picked up at
the next session start, `compass_index`, or `speclaw watch`. The first build is
always an explicit `compass_index` / `speclaw index`.

If the graph is missing (no `.speclaw/index.db`), run `compass_index` first —
a missing graph is not license to skip Compass. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

<!-- speclaw:map:start -->
speclaw · 266 files · 1254 nodes
src/ (132)  test/ (126)  scripts/ (7)  eslint.config.js/ (1)
hubs: write 563 · tmpRepo 540 · buildIndex 160 · read 141 · openDb 123 · runCli 95 · has 71 · specInit 65 · commit 55 · handleHarness 44 · estimateTokens 44 · emptyReport 42
entry: src/server.ts (mcp) · src/cli/index.ts (bin)
<!-- speclaw:map:end -->

## Project-specific starting points

- **Entrypoints**: `buildServer` (`src/server.ts`) registers every module's MCP
  tools; `dispatch` / `main` (`src/cli/index.ts`) route CLI commands to
  `src/cli/commands/*.ts`.
- **Module registration**: `registerFoundation`, `registerSpec` (lawbook),
  `registerCompass`, `registerCortex`, `registerTools` — start here to find the
  logic behind an MCP tool.
- **Compass core**: `buildIndex` (`compass/indexer.ts`) → `parse`
  (`compass/parser.ts`) → `extract` → `openDb` (`compass/db.ts`); queries in
  `compass/query.ts` and `compass/hybrid.ts`; ranking in `compass/pagerank.ts`.
- **Lawbook core**: `specInit` and the archive/sync rules in
  `lawbook/engine.ts`; ceremony in `lawbook/levels.ts`; `quick.ts`/`ship.ts`
  for level-0 work.
- **Cortex**: `handleHarness` (`cortex/harness.ts`), briefs in
  `cortex/brief.ts`, the Compass-first gate in `cortex/compass-gate.ts`.
- **Foundation / setup**: `configureAgent` + `writeMcpConfig`
  (`shared/agents.ts`), hooks in `foundation/hooks.ts`, law compilation in
  `foundation/compile-laws.ts`, integrity in `foundation/integrity.ts`.
- **Tests**: `tmpRepo` / `write` (`test/helpers/env.ts`) are the most-called
  helpers; `compass_affected_tests` picks the tests for a change.

