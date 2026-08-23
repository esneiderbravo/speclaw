# Database report — add-requirement-coverage

| Field | Value |
| --- | --- |
| Discipline | database |
| Change | add-requirement-coverage |
| Date | 2026-08-23 |
| Branch | feat/requirement-coverage |
| Environment | `/Users/esneiderbravo/Projects/speclaw` (throwaway `.speclaw/index.db` via index) |

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Schema compile | `npm run build` | pass |
| Index rebuild | `node dist/cli/index.js index` | pass — schema 5, `coverage_links` populated |
| Isolation | ephemeral project index under `.speclaw/` | no live user DB writes |

## Schema change

- `SCHEMA_VERSION`: `"4"` → `"5"`
- New table `coverage_links` (artifact_type, name, revision, kind, file_path, line, node_id, source_type, origin)
- Indexes on target, file_path, node_id
- `resetSchema` drops `coverage_links` first
- Spec items are **not** persisted (always reparsed from disk)

## Tests

| Kind | Evidence |
| --- | --- |
| Unit | Existing `test/integration/db.test.ts` stamps `SCHEMA_VERSION` |
| Integration | Live index run after bump rebuilds links from comment directives |
| Manual | Coverage JSON shows links with `origin: "comment"` and `nodeId` set |

## Spec-scenario coverage

| Scenario | How verified |
| --- | --- |
| Schema bump rebuilds links | index after bump; links present in report |
| Spec items not in SQLite | design + code: only `coverage_links` table |

## Pre-existing failures

None.

## Manual steps not automated

None beyond the index run recorded above.

## Verdict

pass — schema 5 and derived `coverage_links` rebuild cleanly on reindex.
