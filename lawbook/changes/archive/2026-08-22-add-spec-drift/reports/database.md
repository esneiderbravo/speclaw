# Database checks — add-spec-drift (2026-08-22)

Date · Branch `feat/spec-drift` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Schema stamp | unit `openDb` / SCHEMA_VERSION `"6"` | ✅ |
| Needs-reindex on wipe | `drift.test.ts` schema 5→6 | ✅ marker set; anchors rehydrated |
| Projection table | `spec_anchors` from `lawbook/anchors/*.json` | ✅ dogfood reseal wrote 10 JSON files |

## Tests added / updated

Schema reopen + rehydrate covered in `test/unit/drift.test.ts`.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Schema 5 database is rebuilt safely | unit test |
| Index deletion does not lose seals | rehydrateAnchors on openDb |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Schema 6 + projection model verified.
