# Tasks — add-incremental-index

- [x] Step 0: Create the feature branch `feat/incremental-index` (must be first).
- [x] Shared recipe: add `EMBED_INPUT_VERSION` + `contentHashFor()`; compose LexicalEmbedder id as `lexical-hash-v1+${EMBED_INPUT_VERSION}`.
- [x] Schema 9: `embedding_cache`, `dir_hashes`, `files.mtime_ms`/`size`, `nodes.content_hash`; replace `node_embeddings` table with VIEW; implement `migrate8to9` with rollback.
- [x] Merkle: `merkle.ts` (`dirHash`, `HASH_EMPTY`, byte-order sort); persist/compare `dir_hashes`; root short-circuit uses same file set as walker.
- [x] Indexer: stat prefilter; skip read when mtime+size match; on change extract + set content_hash; `embedNodes` with cache hit/miss + dedupe; stats `computed`/`fromCache`/`skippedByStat`/`rootUnchanged`.
- [x] Cache lifecycle: LRU by max MB (default 256); `--prune` orphans past retention (default 30d); force bypasses prefilter.
- [x] CLI: `speclaw index --force` / `--prune` (+ optional size/retention); help text; print new stats. MCP `compass_index` surfaces the same stats.
- [x] Fragment independence: reindex file A must not mutate rows owned by file B (test).
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
