# add-hybrid-retrieval — hybrid search: FTS5 + vectors + RRF + personalized PageRank

## Why

`compass_find` today is two overlapping lexical paths: `exact` → `name LIKE '%q%'`
(ordered by exactness then short names), and `concept` → cosine over
`LexicalEmbedder` (subtoken hash vectors). Neither knows structural importance
nor the agent's current focus (diff / active work). The product moat is
`explore` / blast radius / affected tests — but the front door is a weak
substring search.

Roadmap **hybrid-retrieval** (#16). Explore (2026-08-25) locked:

| # | Decision |
| --- | --- |
| 1 | **Full pipeline** in one change: FTS5/BM25 + KNN + name list → RRF + name boost → ego-graph → personalized PageRank → structural rerank → token budget / TreeContext + golden-set gate |
| 2 | Hybrid **always** under `compass_find`; `mode` only adjusts route weights (exact→sparse-heavy, concept→dense-heavy) |
| 3 | **Out of scope:** PotionEmbedder / downloaded models, sqlite-vec, indexing full function bodies into FTS |
| 4 | `engines.node` **`>=22.16`** with soft degradation when FTS5 is unavailable |
| 5 | Ceremony **level 3** (graph proposed 2; human override) |

## What

1. **Schema 10** — `node_text` + external-content FTS5 `nodes_fts` (name, subtokens, signature, doc) + `pagerank`; migrate 9→10; reuse `embedding_cache` on reindex.
2. **Extract** — docstring (TS/JS prior `/** */`; Python first body string) + precomputed name subtokens.
3. **`hybridSearch`** — three candidate lists (BM25, KNN, name), RRF `k=60` with name boost, focus from explicit `focus` or worktree/`changedFiles`, personalized PageRank on bipartite file↔symbol graph, structural rerank (churn, hops-to-focus, kind), binary-search token budget + TreeContext (`⋮`).
4. **MCP** — no new tools; `compass_find` runs hybrid; aliases `compass_search` / `compass_recall` keep working.
5. **CLI** — `search` / `find` / query surface: `--focus`, `--max-tokens`, `--explain`; doctor reports Node version + FTS5 availability + active embedder.
6. **Package** — `engines.node` `>=22.16`.
7. **Eval** — golden set (≥40 query→symbol pairs) with **MRR@10** gate vs prior LIKE baseline; latency budget p95 on fixture.

## Non-goals

- Potion / model2vec / ONNX embedders (follow-up).
- sqlite-vec as a hard dependency.
- FTS over full function bodies.
- New MCP tools or undoing tool-surface consolidation.
- Competing with Cursor-trained neural retrieval quality.

## Migrations

Compass **SCHEMA_VERSION 9 → 10**. Additive FTS/pagerank tables; reindex populates
`node_text` (docs need extract). Embedding cache MUST be reused when model id
unchanged. Package **engines** bump is a minor with CHANGELOG note; runtime
without FTS5 degrades (two lists) and sets `degraded`.

## Capabilities

- `code-graph` — schema 10, hybrid retrieval, ranking, focus, budget render
- `cli` — search/find flags, doctor FTS/Node/engines messaging, index reindex UX
