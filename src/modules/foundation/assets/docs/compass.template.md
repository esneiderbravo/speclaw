# Compass — code intelligence for agents in {{project_name}}

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
| `compass_find` | Find code: `mode: exact` by name/keyword, `mode: concept` by meaning in natural language. |
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

Compass uses index schema 11. speclaw 2.0.9 or older, including an MCP entry
pinned at `@2.0.9`, rebuilds a schema-11 index from scratch (losing the
embedding cache). Run `speclaw update` so the pinned MCP entry moves to 2.0.10.

`compass_index` also takes `action: start|stop|status` to keep the index fresh
automatically (a debounced incremental re-index on file change).

Under Claude Code, a `SessionStart` hook refreshes an existing index when each
session starts (`speclaw session-start`: silent, never fails, skips
when `.speclaw/index.db` is absent, and leaves this file alone when nothing
changed). The first build is always an explicit `compass_index` /
`speclaw index`.

If the graph is missing (no `.speclaw/index.db`), run `compass_index` first —
a missing graph is not license to skip Compass. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

<!-- speclaw:map:start -->
<!-- speclaw:map:end -->

## Project-specific starting points

<!-- Filled in during speclaw init: the project's real entrypoints, core
modules, and the traces agents need most often. -->
{{compass_hints}}
