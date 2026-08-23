# Database checks — add-impact-affected (2026-08-22)

Date · Branch `feat/impact-affected` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | ✅ |
| Schema reopen / stamp | `npm test` (affected-tests + db integration) | ✅ `SCHEMA_VERSION` `"7"`; wipe on `"6"` → needs_reindex |
| Index populate | `node dist/cli/index.js index` | ✅ 141 files · `is_test` / `module` populated |

## Schema change

| Item | Detail |
| --- | --- |
| Version | `"6"` → `"7"` |
| `files.is_test` | INTEGER NOT NULL DEFAULT 0; index `idx_files_is_test` |
| `files.module` | TEXT NOT NULL DEFAULT `''` |
| Migration | Drop/recreate derived schema on mismatch (existing pattern); forced reindex |

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Schema 6 DB rebuilt on open | integration `opening a schema-6 stamped db` |
| Test files marked at index time | integration `schema 7 stamps is_test` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Ready to sync and archive.
