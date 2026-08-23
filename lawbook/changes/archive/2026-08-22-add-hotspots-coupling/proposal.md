# add-hotspots-coupling — hotspots + temporal coupling for agents

## Why

Compass already answers structural questions (callers, blast radius). It still
cannot answer the two history-shaped questions that predict where bugs and
refactors concentrate:

1. **Hotspots** — files that change often *and* contain unhealthy structure
   (deep nesting, many branches, large symbols).
2. **Change coupling** — files that co-commit even when no AST edge exists
   (schema ↔ migration, client ↔ server).

`git-history` already ships `churn` / `coChanges` (+ HEAD cache), but they have
**no production callers**, return only raw counts, and never join complexity.
Impact-affected (0.3.10) added `files.is_test`, which lets coupling classify
healthy file↔test pairs without moralizing.

This is roadmap piece **hotspots-coupling** (`docs/roadmap/knowledge/hotspots-coupling.md`),
ordered after impact-affected (#9). Explore locked: **90-day** default window,
**schema 8** for `node_metrics`, **both** MCP/CLI tools, **honest** tool copy
(no “proven by CodeScene case study” claims).

## What

1. **AST health metrics at index time** — `loc`, `max_nesting`, `branches`
   (and params when cheap) per definition node, stored in `node_metrics`.
2. **Schema `"7"` → `"8"`** — add `node_metrics`; forced reindex.
3. **Richer history helpers** (still fail-soft, still cached) — authors / lines
   for activity; Jaccard `strength`; `maxFilesPerCommit` discard for giant
   commits; default consumer window **90 days**.
4. **`compass_hotspots` / `speclaw hotspots`** — two axes (churn + health),
   `sortBy`: `churn` | `complexity` | `combined` (heuristic, documented).
5. **`compass_coupling` / `speclaw coupling <file>`** — temporal partners with
   `strength`, `both`, commit counts, `in_graph`, and `isTestPair` via
   `files.is_test`. No judgmental labels beyond those facts.
6. Both tools in **`MINIMAL_OMIT`**; descriptions stay within the word budget
   and stay honest about evidence.

## Non-goals

- Rebuilding a `commit_files` warehouse / incremental git ingest (HEAD cache is enough)
- Ownership / authors MCP tools, CodeScene-style UI
- Wiring hybrid-retrieval rerank or adaptive-ceremony (consumers later)
- A single opaque “health score” as the only output
- Level-2 coverage or runtime profiling

## Migrations

Yes — Compass `SCHEMA_VERSION` `"7"` → `"8"` (`node_metrics`; forced reindex).
`speclaw update` migration note for the next patch (0.3.11). Additive MCP/CLI
surface (non-breaking). Dogfood: `speclaw hotspots` and `speclaw coupling` on
this repo after reindex.

## Decisions locked in explore

| Decision | Choice |
| --- | --- |
| Default history window | 90 days |
| Complexity storage | Schema 8 `node_metrics` |
| Scope | Both hotspots + coupling |
| Messaging | Honest (no CodeScene case-study as proof) |
| Git plumbing | Extend existing `git-history` — do not rewrite |
