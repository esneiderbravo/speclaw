# Backend checks — add-impact-affected (2026-08-22)

Date · Branch `feat/impact-affected` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean; ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` + asset copy |
| Unit / integration / contract | `npm test` | ✅ 316 pass / 0 fail (coverage lines 87% / branches 82% / funcs 87%) |

## Tests added / updated

- `test/unit/impact.test.ts` — id-first collision, import-only dependents, call-only filter, globals, grouped caps, cycles, globs/config.
- `test/unit/affected.test.ts` — reachable-test selection, global → `mode: all`, command builder, invalid config.
- `test/integration/affected-tests.test.ts` — schema 7 metadata, schema-6 wipe/reindex, `--from-diff`, build-target empty, unindexed `.go` warn.
- `test/integration/compass.test.ts` — impact flat API.
- `test/contract/registers.test.ts` — `compass_affected_tests` registered; impact still accepts `node`.

## Spec-scenario coverage

| Scenario (code-graph / cli) | Verified by |
| --- | --- |
| Id-resolved edge preferred over name | `impact.test.ts` collision + same-file resolve |
| Name-resolved flagged | resolution field on CTE (`by-name`) |
| Import-only dependent found | `impact finds import-only dependents` |
| Restricting edge kinds excludes imports | `impact with call-only omits pure importers` |
| Cyclic graph terminates | `cyclic callers terminate` |
| Large blast radius summarised | `grouped impact caps module representatives` |
| Flat format on request | flat format in unit + compass integration |
| Ambiguous symbol announced | warnings when definitions.length > 1 |
| Touching tsconfig/package.json repo-wide | `global file reports` + CLI dogfood |
| Test-only change empty for build | integration `build target empties` |
| Schema 6 rebuilt / needs-reindex | integration schema reopen |
| Test files marked at index | schema 7 `is_test` integration |
| Only reachable tests selected | `affectedTests selects only reachable tests` |
| Global file selects full suite | `global lockfile` + CLI `--file package.json` |
| Unindexed language warns | `.go` warning integration |
| Diff mode uses git changed files | `affected-tests --from-diff` integration |
| Missing/invalid config | unit config tests |
| CLI impact / affected-tests / no header | HELP + dispatch; dogfood `node dist/cli/index.js …` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Ready to sync and archive.
