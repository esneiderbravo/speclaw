# Backend checks — index-at-session-start (2026-10-06)

Date 2026-10-06 · Branch `fix/compass-source-and-session-index` · cwd
`/Users/esneiderbravo/Projects/speclaw`; manual runs in a throwaway repo under
`/tmp/speclaw-mv.RlefRR`. Node v24.17.0 (`node:sqlite`), macOS 26.5.1 arm64.

Scope: the no-op fast path in `buildIndex` (`src/modules/compass/indexer.ts`)
and `compactMapPending` (`src/modules/compass/map.ts`).

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ 663/663 pass, 0 fail. `indexer.js` 94.44% line / 84.67% branch / 93.75% funcs; `map.js` 80.58 / 63.64 / 83.33; all files 85.77 / 82.56 / 87.80 (floor 80) |
| Fast-path suite | `test/integration/index-noop.test.ts` (in `npm test`) | ✅ all green: "a no-op run leaves dir_hashes, pagerank, edges, the embedding cache, and the map untouched", "force and prune bypass the no-op fast path", "an explicit cache cap bypasses the no-op fast path", "a removed file is not a no-op", "an emptied map block is refilled on a no-op run", "a no-op run never creates docs/compass.md" |
| Pre-existing no-op cases | `test/integration/compass.test.ts` / reindex (in `npm test`) | ✅ "no-op reindex reports rootUnchanged and zero computed", "no-op reindex still reports repository totals equal to the DB row counts" |
| Spec coverage | `node dist/cli/index.js coverage --change index-at-session-start` | ✅ `ok 11 - req~index-noop-fast-path~1 (itest, impl)` |

## Tests added / updated

None added by the tester. The implementer's `index-noop.test.ts` uses
write-logging SQLite triggers on `dir_hashes`, `pagerank`, `edges`, and
`embedding_cache`. A forced run proves the triggers are live. I reviewed the
file and it is green.

## Spec-scenario coverage

Delta `specs/code-graph/spec.md`, `req~index-noop-fast-path~1`:

| Scenario | Verified by |
|----------|-------------|
| A no-op run leaves the compact map untouched | `index-noop.test.ts` (map untouched); manual (b): bytes and mtime of `docs/compass.md` identical, totals > 0 (`1 files · 2 nodes · 1 edges`, `root unchanged`) |
| A no-op run skips global post-processing | `index-noop.test.ts` triggers: no `dir_hashes` or `pagerank` writes; `indexed_at` advances (manual (b): `23:52:45.437Z → 23:52:47.109Z`) |
| An empty compact map block is refilled on a no-op run | `an emptied map block is refilled on a no-op run` |
| A changed file still runs the full pass | `index-noop.test.ts` (removed file is not a no-op) + compass reindex tests; manual (c): edited file re-extracted, `explore` shows the edit; repo reindex wrote the map (counts 234→238 files) |
| Force, prune, and an explicit cache cap bypass the fast path | `force and prune bypass the no-op fast path`, `an explicit cache cap bypasses the no-op fast path` |
| The no-op index is not slower than main | `performance.md`: branch median 203.1 ms vs main 377.1 ms (n=30) and 208.7 vs 394.2 (n=40) |

All other code-graph scenarios in the delta are carried verbatim from the
sibling `fix-compass-source-offsets` delta or the canonical spec. This change
does not touch them, and the full suite (663/663) is green.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

**PASS**.
