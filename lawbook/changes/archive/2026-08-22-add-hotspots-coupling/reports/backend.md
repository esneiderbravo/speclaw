# Backend checks — add-hotspots-coupling (2026-08-22)

Date · Branch `feat/hotspots-coupling` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean; ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` + asset copy |
| Unit / integration / contract | `npm test` | ✅ 328 pass / 0 fail (coverage lines ~87.6% / branches ~81.7% / funcs ~86.9%) |

## Tests added / updated

- `test/unit/metrics.test.ts` — nested branches + arithmetic ignored; LOC span; `node_metrics` persisted at index.
- `test/unit/hotspots.test.ts` — `fileActivity` authors/lines; `maxFilesPerCommit` skip; Jaccard; 90d window label; combined ranking; coupling `isTestPair` + giant filter + `minShared`.
- `test/integration/hotspots.test.ts` — schema 8 / reopen from 7; CLI `--json` without branded header.
- `test/contract/registers.test.ts` — `compass_hotspots` / `compass_coupling` registered.
- `test/helpers/git.ts` — optional per-commit author identity.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Nested branches counted; arithmetic ignored | `metrics.test.ts` |
| LOC matches line span | `metrics.test.ts` |
| Schema 7 DB rebuilt on open (→ 8) | `integration/hotspots.test.ts` |
| Default window ~90 days | unit `sinceDaysAgo` + dogfood JSON `days: 90` |
| High-churn unhealthy ranks above quiet clean | `hotspots ranks high-churn…` |
| Axes visible under combined | hotspot entries carry `activity` + `health` |
| Shallow clone announced | warnings path (existing shallow git-history tests + field) |
| Co-change without AST edge `in_graph: false` | dogfood `indexer.ts` partner; unit coupling fixtures |
| Giant commits excluded + diagnostics | unit oversized + coupling giant |
| File↔test `isTestPair` | coupling unit |
| Weak single co-commit filtered | `weak single co-commit…` |
| Richer activity authors/lines | `fileActivity reports…` |
| Oversized commits excluded from coupling | `coChanges skips oversized…` |
| Summed churn / binary / last-touch / shallow / cache | pre-existing `git-history.*` tests (unchanged contract) |

## Pre-existing / unrelated failures

none

## Pending manual steps

none (dogfood: `node dist/cli/index.js index|hotspots|coupling` on this repo)

## Verdict

Ready to sync and archive.
