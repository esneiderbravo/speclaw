# Database checks — add-incremental-index (2026-08-25)

Date · Branch `feat/incremental-index` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ |
| Type-check + compile | `npm run build` | ✅ |
| Unit / integration | `npm test` | ✅ 389 pass / 0 fail |

## Tests added / updated

- Schema stamp `"9"` — `metrics.test.ts`, `hotspots.test.ts`, migrate fixture.
- `embedding_cache` + `node_embeddings` VIEW — migrate fixture asserts view type and cache rows.
- `dir_hashes` — merkle unit + emptying-directory integration.
- `files.mtime_ms` / `size`, `nodes.content_hash` — exercised via indexer + migrate backfill.
- Rollback — incomplete schema-8 fixture leaves `schema_version = '8'` after failed open.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Schema 7 rebuilt under 9 | `hotspots.test.ts` (stale wipe / needs_reindex) |
| Existing vectors survive 8→9 | `embedding-cache.test.ts` |
| Failed migration rolls back | `embedding-cache.test.ts` |
| Cache keyed by content_hash; VIEW for recall | migrate + identical-twins view count |
| Fragment independence (no cross-file node/edge mutation) | `fragments.test.ts` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

✅ Schema 9 migration and cache lifecycle behave as specified.
