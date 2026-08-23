# Database checks — add-hotspots-coupling (2026-08-22)

Date · Branch `feat/hotspots-coupling` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Schema stamp | `npm test` (metrics + hotspots integration) | ✅ `SCHEMA_VERSION === "8"`; `node_metrics` present |
| Stale open | integration reopen after stamping `"7"` | ✅ wipe + `needs_reindex` |
| Index write path | unit `indexer persists node_metrics` | ✅ row per definition |
| Compile / suite | `npm run build` · `npm test` | ✅ 328 pass / 0 fail |

## Schema delta

- **Version:** `"7"` → `"8"`
- **New table:** `node_metrics(node_id PK → nodes CASCADE, loc, max_nesting, branches)`
- **Reset:** `resetSchema` drops `node_metrics` with other derived tables
- **Stale detection:** missing `node_metrics` OR version mismatch forces recreate + `needs_reindex`
- **Cache:** `git_history_cache` payloads extended for `fileActivity` and co-change diagnostics (same table)

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Schema 7 rebuilt under 8 | `integration/hotspots.test.ts` |
| Metrics computed at extract/index | `metrics.test.ts` |
| Test/module columns retained | pre-existing affected-tests schema tests (still on `SCHEMA_VERSION`) |

## Pre-existing / unrelated failures

none

## Pending manual steps

none — dogfood reindex on this repo stamped schema 8 (`145 files · 524 nodes`)

## Verdict

Schema 8 migration path verified; ready to sync and archive.
