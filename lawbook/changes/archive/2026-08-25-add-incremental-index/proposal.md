# add-incremental-index — Merkle short-circuit + embedding cache by content hash

## Why

`compass_index` already skips files whose **content hash** matches, but it still
**reads every file** to decide. Worse: `node_embeddings` is keyed by `node_id`
with `ON DELETE CASCADE` on `nodes`. Reindexing a file deletes its nodes and
**destroys every embedding**, even when the embedder input is byte-identical.
Agents rename files, move functions, `git checkout`, and stash constantly — each
of those today recomputes vectors for no reason.

Roadmap **incremental-index** (#14). Explore (2026-08-25) locked: one PR,
real migration 8→9 (no wipe), cache key = embedder input + `EMBED_INPUT_VERSION`
(not `body_hash`), LRU auto + `--prune` as in the roadmap doc.

## What

1. **`embedding_cache`** — `(content_hash, model)` PK; survives node deletes.
2. **`nodes.content_hash`** — hash of embedder-input recipe; `LexicalEmbedder.id`
   becomes `lexical-hash-v1+${EMBED_INPUT_VERSION}`.
3. **`node_embeddings` → VIEW** joining nodes → cache (same columns for `recall`).
4. **`files.mtime_ms` / `files.size`** — stat prefilter before reading bytes.
5. **`dir_hashes` Merkle tree** — root short-circuit; same file set as walker.
6. **Migration 8→9** — `BEGIN IMMEDIATE`, backfill, copy vectors, stamp 9;
   rollback on failure.
7. **Stats** — `computed` / `fromCache` / `skippedByStat` / `rootUnchanged`.
8. **CLI** — `--force`, `--prune`, optional max cache MB / retention.
9. **Watcher** — keep debounce; benefit from cheaper `buildIndex` (path-scoped
   ancestor rehash if low-cost in same PR).

## Non-goals

- Hybrid retrieval / FTS5 / richer context-string embeddings (later #16).
- Changing engines Node floor.
- Query-language surface.
- Following symlinks by default.

## Migrations

Compass **SCHEMA_VERSION 8 → 9**. Real migration preserves embeddings. Package
patch or minor bump as release process dictates (no MCP breaking rename).

## Capabilities

- `code-graph` — index/embed cache/Merkle/migration
- `cli` — index flags and reported statistics
