# Database checks — add-hybrid-retrieval (2026-08-25)

Date · Branch `feat/hybrid-retrieval` · Environment: local Node v24.17.0 · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Schema open / migrate | `npm run test` (fts + embedding-cache + db integration) | ✅ |
| Index populate | `speclaw index` on throwaway `/tmp/hybrid-smoke` | ✅ 2 files · node_text + pagerank |

## Tests added / updated

- `test/unit/fts.test.ts` — migrate9to10 creates `node_text`/`pagerank`, stamps `"10"`, FTS MATCH
- Existing migrate8to9 / embedding-cache tests still pass (8→9 stamps `"9"` then chain opens as 10 via openDb)

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Schema 7 rebuilt under 10 | isStale wipe path (existing db tests + SCHEMA_VERSION assert) |
| Schema 9 migrates to 10 without wiping embeddings | migrate9to10 leaves embedding_cache; needs_reindex set |
| Existing vectors survive 8→9 | existing `failed migrate8to9 rolls back` + embedding-cache suite |
| FTS soft-skip | `ensureFts` catch → meta `fts5=0` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

✅ Schema 10 + FTS external-content + pagerank table shipped with migration.
