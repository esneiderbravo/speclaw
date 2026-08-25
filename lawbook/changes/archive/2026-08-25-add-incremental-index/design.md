# Design — add-incremental-index

## Decisions (confirmed in explore)

| # | Decision |
| --- | --- |
| Scope | One PR: embedding cache + mtime prefilter + Merkle |
| Schema | Real migrate **8→9** (preserve vectors; no wipe) |
| Cache key | Hash of **embedder input** + `EMBED_INPUT_VERSION` (not `body_hash`) |
| Lifecycle | Auto LRU by size (default 256 MB) + explicit `--prune` |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| `dirHash` / root short-circuit | `compass/merkle.ts` (new) | Pure; byte-order sort; `HASH_EMPTY` |
| Schema + migrate8to9 | `compass/db.ts` | Only place that owns SCHEMA |
| Stat prefilter + embed cache | `compass/indexer.ts` | Owns walk/extract/embed loop |
| `contentHashFor` / version | `compass/extract.ts` or small `embed-input.ts` | Single recipe |
| Model id composition | `compass/embedder.ts` | `lexical-hash-v1+inN` |
| `recall` | unchanged query on VIEW | Zero read-path risk |
| Flags / UX | `cli/commands/index-build.ts` | `--force` `--prune` |
| Watch | `watcher.ts` | Still calls `buildIndex`; cheaper no-op |

**Embed flow:**

```
pending nodes missing cache row for active model
  → dedupe by content_hash
  → embed once → INSERT embedding_cache
  → refresh last_seen_at for hits
```

**Stat + Merkle layers:**

```
stat match (mtime_ms, size) → reuse files.hash (no read)
else read + sha256 → update files
rebuild dir hashes bottom-up → root match → skip extract/embed phase
```

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| Wipe on schema bump | Contradicts the feature pitch |
| Cache key = `body_hash` | Drift hash ≠ embed recipe; stale vectors after recipe change |
| Rewrite `recall` against cache | VIEW keeps the hot path stable |
| Merkle-only without cache | Misses the agent rename/checkout pain |
| Cache-only without mtime | Still reads entire tree on every no-op |

## Trade-offs

- **mtime 1s granularity** — same-second same-size change can skip read; `--force` + hash-when-read mitigate (aider trade-off).
- **Merkle misaligned with walker** — silent false “unchanged”; mitigated by one shared enumeration.
- **Lexical embedder is cheap today** — cache still unlocks hybrid-retrieval later; I/O savings are real now.
- **First real migrate path** — more code than wipe; needs fixture test + IMMEDIATE txn.

## File plan

```
src/modules/compass/merkle.ts          NEW
src/modules/compass/db.ts              SCHEMA 9; migrate8to9; auto_vacuum policy
src/modules/compass/indexer.ts         stat + merkle + embedNodes/cache stats
src/modules/compass/extract.ts         contentHashFor / EMBED_INPUT_VERSION
src/modules/compass/embedder.ts        id includes recipe version
src/modules/compass/watcher.ts         optional ancestor touch; still buildIndex
src/modules/compass/register.ts        prune/force params if exposed
src/cli/commands/index-build.ts        flags + richer output
test/unit/merkle.test.ts               NEW
test/unit/embedding-cache.test.ts      NEW
test/unit/migrate-8-to-9.test.ts       NEW
test/unit/content-hash.test.ts         NEW
test/unit/indexer-stat-prefilter.test.ts NEW
test/unit/fragments.test.ts            NEW
test/integration/reindex.test.ts       NEW (rename / move / checkout)
```

## Risks

- VIEW breaks forgotten `INSERT INTO node_embeddings` — grep + redirect all writes.
- Partial migrate — always `BEGIN IMMEDIATE` / `ROLLBACK`.
- Cache growth — LRU + prune + report size in doctor later if cheap.
