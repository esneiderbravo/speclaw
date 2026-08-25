# Tasks — add-hybrid-retrieval

- [x] Step 0: Create the feature branch `feat/hybrid-retrieval` (must be first).
- [x] Schema 10: add `node_text`, external-content FTS5 `nodes_fts` + triggers, `pagerank`; migrate 9→10 with clear reindex reason; soft-skip FTS when CREATE VIRTUAL TABLE fails; reuse `embedding_cache` on reindex.
- [x] Extract: docstring (TS/JS prior block comment; Python first body string) + name subtokens; populate `node_text` during index; recompute global PageRank at end of index.
- [x] Rank core: `routeWeights` / `isSymbolQuery`, RRF `k=60`, name boost (exact / case-insensitive / prefix); never arithmetically mix raw BM25 and cosine.
- [x] `hybridSearch`: three lists → RRF → ego expand (degree cap) → personalized PageRank (focus from args or worktree `changedFiles`) → structural rerank (PR, churn, hops, kind) → `fitToBudget` + TreeContext; expose per-hit `signals` and `degraded`.
- [x] Wire `findSymbols` / `compass_find` to hybrid always (`mode` adjusts weights only); keep `compass_search` / `compass_recall` aliases.
- [x] CLI: `--focus`, `--max-tokens`, `--explain` on search/find/query; doctor reports Node version, FTS5 availability, active embedder; `package.json` engines `>=22.16`.
- [x] Golden set (≥40 pairs) MRR@10 gate vs LIKE baseline + p95 latency budget on fixture; unit tests for rank/pagerank/budget/fts escape/ASC bm25.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
