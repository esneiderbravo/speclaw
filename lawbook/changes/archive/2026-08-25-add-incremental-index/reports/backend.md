# Backend checks — add-incremental-index (2026-08-25)

Date · Branch `feat/incremental-index` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean; ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` + asset copy |
| Unit / integration / contract | `npm test` | ✅ 389 pass / 0 fail (coverage lines ~83.6% / branches ~80.7% / funcs ~82.8%) |

## Tests added / updated

- `test/unit/merkle.test.ts` — order-independent `dirHash`, empty sentinel, root changes on delete.
- `test/unit/content-hash.test.ts` — stable recipe hash; signature changes invalidate.
- `test/unit/embedding-cache.test.ts` — no-op reindex `computed === 0`; rename cache hit; migrate 8→9 preserves vectors; failed migrate rolls back to schema 8.
- `test/unit/indexer-stat-prefilter.test.ts` — mtime+size skip avoids re-hash; `--force` re-hashes.
- `test/unit/fragments.test.ts` — reindexing A leaves B's nodes/edges untouched.
- `test/integration/reindex.test.ts` — rootUnchanged; move symbol; restore prior content; identical twins share cache; prune orphans; LRU size eviction; empty dir changes root.
- `test/unit/embedder.test.ts` — model id includes `EMBED_INPUT_VERSION`.
- `test/integration/hotspots.test.ts` / `test/unit/metrics.test.ts` — schema stamp asserts `SCHEMA_VERSION` / `"9"`.

## Spec-scenario coverage

| Scenario (new / touched) | Verified by |
| --- | --- |
| Unchanged repository short-circuits | `reindex.test.ts` rootUnchanged; CLI manual no-op |
| Single changed file limits extraction | incremental path + fragment test (A only) |
| Emptying a directory changes the root | `reindex.test.ts` |
| Matching stat skips a read | `indexer-stat-prefilter.test.ts` |
| Force bypasses the prefilter | `indexer-stat-prefilter.test.ts` |
| Renaming recomputes nothing | `embedding-cache.test.ts` |
| Moving code recomputes nothing | `reindex.test.ts` |
| Returning to previous content | `reindex.test.ts` checkout-like |
| Identical symbols embed once | `reindex.test.ts` |
| Recipe bump invalidates | embedder id + `contentHashFor` version field |
| Orphans pruned on request | `reindex.test.ts` prune |
| Size limit LRU | `reindex.test.ts` maxCacheMB |
| Existing vectors survive migration | `embedding-cache.test.ts` migrate |
| Failed migration rolls back | `embedding-cache.test.ts` |
| Reindexing A leaves B untouched | `fragments.test.ts` |
| Carry-forward blast-radius / hotspots / etc. | pre-existing suite (unchanged contract) |

## Pre-existing / unrelated failures

none

## Pending manual steps

none — CLI no-op index in a throwaway tmp repo showed `0 computed · … · root unchanged`; `help` lists `--force` / `--prune`.

## Verdict

✅ Backend gates green; incremental index + embed cache behavior covered.
