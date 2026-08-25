# Design — add-hybrid-retrieval

## Decisions (confirmed in explore)

| # | Decision |
| --- | --- |
| Scope | Full pipeline in **one** PR (not MVP split) |
| API | Hybrid always under `compass_find`; `mode` only changes RRF weights |
| Out | PotionEmbedder, sqlite-vec hard dep, full-body FTS |
| Engines | `>=22.16` + soft degrade without FTS5 |
| Ceremony | Level 3 |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Schema 10 + FTS triggers + `pagerank` | `compass/db.ts` | Owns SCHEMA; detect FTS5 create failure |
| Docstring + subtokens | `compass/extract.ts` | Index-time text; forces reindex for `doc` |
| Populate `node_text` / global PR | `compass/indexer.ts` | Same walk as extract/embed |
| RRF, routeWeights, boost, structural rerank | `compass/rank.ts` (new) | Pure, unit-testable |
| Bipartite personalized PageRank | `compass/pagerank.ts` (new) | Global score at index; personalized at query on ego subgraph |
| Token budget + TreeContext | `compass/budget.ts` + render helper | Binary search ±15%; `⋮` elision |
| `hybridSearch` / wire find | `compass/query.ts` + `explore-rich.findSymbols` | Single entry for MCP + CLI |
| Focus defaults | reuse `shared/git.changedFiles` / worktree helpers | Already used by `diff_context` |
| MCP descriptions | `compass/register.ts` | Update `compass_find`; keep aliases |
| CLI flags + doctor | `cli/commands/query*.ts`, `doctor.ts` | `--focus`, `--max-tokens`, `--explain` |
| Engines | `package.json` | `>=22.16` |

**Pipeline:**

```
query + focus (explicit | worktree | ∅)
  → BM25 (if FTS) + KNN + name lists
  → RRF(k=60) × name boost  → seeds
  → ego-graph expand (degree cap)
  → personalized PageRank + structural rerank
  → fitToBudget / TreeContext
```

**Route weights** (deterministic):

- Symbol-shaped query → `{ bm25: 1, knn: 0.3, name: 1 }`
- Prose → `{ bm25: 0.7, knn: 1, name: 0.5 }`

**Non-goals locked:** no cross-encoder; no directory path-distance as a rank signal (hops only); LexicalEmbedder remains default.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| MVP FTS+RRF only, PageRank later | Human chose full pipeline; one golden-set story |
| Make `compass_search` the primary again | Undoes tool-surface; `compass_find` is canonical |
| Average BM25 + cosine scores | Scale mismatch; RRF is rank-only |
| Hard-require FTS5 / crash on old Node | Contradicts soft degradation + product promise |
| Potion in same PR | Confounds golden-set attribution |
| FTS full bodies | Noise + index size; reevaluate later with metrics |

## Trade-offs

- **engines bump** — npm warns on 22.0–22.15; doctor + `degraded` must carry the message.
- **Seven stages** — latency risk; mitigate with precomputed global PR, degree caps, p95 gate.
- **Ranking opacity** — every hit MUST expose `signals`; CLI `--explain` is required, not optional.
- **Schema 10 reindex** — text extract is new; embeddings MUST come from cache when model unchanged.

## File plan

```
src/modules/compass/db.ts              SCHEMA 10; node_text; nodes_fts; pagerank; FTS detect
src/modules/compass/extract.ts         docstring + subtokens
src/modules/compass/indexer.ts         populate node_text; global pagerank
src/modules/compass/rank.ts            NEW RRF / boost / structural
src/modules/compass/pagerank.ts        NEW bipartite personalized PR
src/modules/compass/budget.ts          NEW fitToBudget
src/modules/compass/query.ts           hybridSearch; search/recall as list builders
src/modules/compass/explore-rich.ts    findSymbols → hybridSearch
src/modules/compass/register.ts        compass_find contract
src/cli/commands/…                     --focus --max-tokens --explain
src/modules/foundation/doctor…         Node / FTS5 / embedder
package.json                           engines >=22.16
test/unit/rank.test.ts                 NEW
test/unit/pagerank.test.ts             NEW
test/unit/budget.test.ts               NEW
test/unit/fts.test.ts                  NEW
test/integration/retrieval.test.ts     NEW golden MRR@10 + latency
```

## Risks

- Inverted BM25 `ORDER BY` (FTS5 scores are negative) — assert ASC in tests.
- Unescaped FTS MATCH syntax — always quote terms.
- Hub symbols explode ego-graph — `MAX_DEGREE` truncate.
- Golden set flakiness — fixture-owned repo, fixed seeds, threshold in CI.
