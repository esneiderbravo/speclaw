# API checks — add-incremental-index (2026-08-25)

Date · Branch `feat/incremental-index` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ |
| Type-check + compile | `npm run build` | ✅ |
| Unit / integration | `npm test` | ✅ 389 pass / 0 fail |

## Surface under test

| Surface | Contract |
| --- | --- |
| CLI `speclaw index` | Flags `--force`, `--prune`, optional `--max-cache-mb` / `--retention`; prints `computed` / `fromCache` / `unchanged` / `skippedByStat` / `root unchanged` |
| MCP `compass_index` | Optional `force` / `prune`; returns same `IndexStats` object as text |
| Help | `index` line documents `--force` / `--prune` |

## Tests added / updated

- Manual (isolated tmp repo): first index `1 computed`; second `0 computed · 1 skippedByStat · root unchanged`.
- Manual: `speclaw help` mentions `--force` / `--prune` on the index line.
- Integration reindex / embedding-cache assert stats fields.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Help lists force and prune | manual `speclaw help` |
| No-op index reports root unchanged | manual CLI + `reindex.test.ts` |
| Carry-forward CLI header / query scenarios | pre-existing e2e / integration suite |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

✅ Index CLI/MCP stats and flags match the delta `cli` requirement.
