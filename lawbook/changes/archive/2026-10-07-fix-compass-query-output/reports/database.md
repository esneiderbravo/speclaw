# Database checks — fix-compass-query-output (2026-10-07)

**Discipline:** database (Compass SQLite index: schema 11 → 12, `ref` edges,
migration/rollback, embedding-cache reuse, mixed versions) · **Change:**
fix-compass-query-output (bug, level 3) · **Date:** 2026-10-07 · **Branch:**
fix/compass-query-output (uncommitted vs `main`) · **cwd:** gates in
`/Users/esneiderbravo/Projects/speclaw`; every database touched for verification
was a throwaway index under `/tmp`.

## Gates & results

| Check | Command | Result |
|---|---|---|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ exit 0. **984/984 pass, 0 fail, 0 skipped.** Coverage over all files: 88.35 % lines / 85.74 % branches / 90.57 % functions. `db.js` 96.31 / 84.07 / 100. |
| Change validation | `node dist/cli/index.js lawbook validate fix-compass-query-output` | ✅ exit 0 (107 advisory warnings, none blocking) |
| Coverage of schema ids | `node dist/cli/index.js coverage --change fix-compass-query-output --json` (isolated copy) | ✅ `req~schema-ref-edges~1` impl+itest covered, `req~schema-edge-membership~1` impl+itest covered, 0 defects |
| `verify` | `node dist/cli/index.js verify` (isolated copy) | ⚠️ exit 1. Only `drift~changed-semantic` on edited anchors plus the expected `docs/compass.md` advisory; no schema/integrity issue (see `backend.md`) |

## Schema change

- `SCHEMA_VERSION = "12"`. No column change: `edges.kind` is TEXT and now
  also holds `'ref'`.
- `migrate11to12`, inside one `BEGIN IMMEDIATE`, sets `needs_reindex` with a
  reason naming schema 12 and stamps `"12"`. On failure it rolls back and keeps
  `"11"`.
- Chains: 8/9 → 10 → 11 → 12, 10 → 11 → 12, and pre-release 11 (no
  `edges.spec`) → 11 → 12 (`db.ts:644-648`).
- Upgrade cost: one full re-extract. `embedding_cache` rows are reused, because
  the embedder input has no edges.
- **Rollback / older binary:** speclaw ≤ 2.0.12 treats `"12"` as unknown and
  rebuilds from scratch (schema 11, embeddings recomputed). This is
  documented in `docs/compass.md`, the template, `CLAUDE.md`, `AGENTS.md`, and
  the 2.0.13 `update` notes.

## Tests added / updated — red before the fix, green after

Red is quoted from `reports/.red-before-fix.txt` (unchanged `src/`, HEAD 5854270).

| Test (`test/integration/db.test.ts`) | Asserts | Red before fix | Green |
|---|---|---|---|
| `schema 11 migrates to 12 and keeps embeddings` | stamp 12, needs-reindex reason names 12, cache rows kept | `Expected values to be strictly equal: actual: '11', expected: '12'` | ✅ |
| `failed 11 to 12 migration rolls back` | throws `/11→12/`, schema stays `"11"` | `Missing expected exception. actual: undefined, expected: /11→12/` | ✅ |
| `schema 10 migrates through 11 to 12 keeping embeddings` | 10 → 12 chain | `actual: '11', expected: '12'` | ✅ |
| `reindex after the 12 migration adds ref edges without re-embedding` | every file re-extracted, `ref` rows present, 0 embeddings computed | `every file is re-extracted … actual: 0, expected: 2` | ✅ |
| `schema 10 migrates past 11 and forces a reindex keeping embeddings`, `schema 9 migrates through 10 and 11 to 12 via openDb keeping embeddings`, `openDb rebuilds a database stamped with an incompatible schema version` (updated literals) | older chains now end at 12 | n/a (expected literal moves, task 11/17) | ✅ |
| Literal `"11"` → `"12"` in `compass`, `hotspots`, `affected-tests`, `git-history-cache`, `metrics`, `fts`, `embedding-cache`, `drift` tests | stamped version | n/a | ✅ |

## Manual verification (throwaway fixtures)

1. **11 → 12 upgrade in place.** I built fixture `/tmp/fcq-fix11.*` (46 TS
   files) with the installed **speclaw 2.0.12** (`speclaw index`). Result:
   `schema 11`, edges `call 1, import 2`, `embedding_cache 91`. Then I ran the
   branch build, `node dist/cli/index.js index`:
   ```
   ✓ 46 files · 92 nodes · 6 edges · 0 computed · 92 fromCache · 0 unchanged · 0 skippedByStat
   ```
   Afterwards: `schema 12`, `needs_reindex` cleared, edges
   `call 1, import 2, ref 3`, `embedding_cache 91`. Every file was
   re-extracted (`0 unchanged`) and **0 embeddings were computed**.
2. **Fresh index under 12** (`/tmp/fcq-fixture.*`): `schema 12`, edges
   `call 1, import 2, ref 3`. The `ref` rows are `render → types.ts:Props`,
   `Widget → types.ts:Props`, and `otherUse → other.ts:Props`. There is no
   `ref` for the `wrap<Props>` type parameter.
3. **Older binary on a 12 index** (`/tmp/fcq-old.*`, a copy of the schema-12
   fixture). `speclaw` 2.0.12 `index`:
   `46 files · 92 nodes · 3 edges · 91 computed · 1 fromCache`. Afterwards:
   `schema 11`, edges `call 1, import 2`. It rebuilt from scratch and dropped
   the refs, as documented.
4. **Rollback of a failed 11 → 12:** covered by the integration test above. I
   did not inject a failure by hand.

All index reads in these steps used `node:sqlite` with `readOnly: true` on the
fixture's own `.speclaw/index.db`.

## Spec-scenario coverage — schema scenarios

| Spec | Requirement | Scenario | Verified by |
|---|---|---|---|
| code-graph | Schema records test and module metadata | Schema 7 database is rebuilt on open (changed: "under schema 12") | `db.test.ts` "openDb rebuilds a database stamped with an incompatible schema version", `affected-tests.test.ts` "schema 7 stamps is_test and module on files" ✅ |
| code-graph | Schema records test and module metadata | Schema 9 migrates forward without wiping embeddings (changed) | `db.test.ts` "schema 9 migrates through 10 and 11 to 12 via openDb keeping embeddings" ✅ |
| code-graph | `req~schema-edge-membership~1` | Schema 10 migrates to 12 and keeps embeddings | `db.test.ts` "schema 10 migrates through 11 to 12 keeping embeddings", "schema 10 migrates past 11…" ✅ |
| code-graph | `req~schema-ref-edges~1` | Schema 11 migrates to 12 and keeps embeddings | `db.test.ts` ✅; manual step 1 ✅ |
| code-graph | `req~schema-ref-edges~1` | Reindex after the 12 migration adds ref edges without re-embedding | `db.test.ts` ✅; manual step 1 (`0 computed`, `ref 3`) ✅ |
| code-graph | `req~schema-ref-edges~1` | Failed 11 to 12 migration rolls back | `db.test.ts` ✅ |

The other scenarios are mapped in `api.md`, `backend.md`, and `cli.md`. The
unchanged ones are in the `backend.md` appendix.

## Pre-existing / unrelated failures

- **The repository's own `.speclaw/index.db` is empty** (schema 11,
  `needs_reindex=1`, 0 edges; checked read-only). This is the version
  alternation described in step 3, happening in the real repo. The
  session-long MCP server, pinned to this repo's `dist/` but loaded before the
  branch build, keeps rebuilding the schema-12 index that branch CLI runs
  stamp. My `coverage` gate run on the repo was one of those runs (see
  `api.md`). It is a derived cache, not user data. Recovery: restart the MCP
  server, then run `node dist/cli/index.js index`. This is not a defect of the
  migration.
- No failing tests.

## Pending manual steps

None for this discipline.

## Verdict

**PASS**: schema 12, the migrations, rollback, cache reuse, and the older-binary rebuild all behave as specified; the overall change verdict is PASS after Rework 2.

### Rework 2 (T1, T2) — re-test

- T1: the worktree-focus scenario and bugfix.md now say *tracked, modified*
  `notes.md`, and the scenario adds "untracked files SHALL NOT be part of the
  worktree focus" (git diff HEAD skips untracked files).
- T2: `budgetExploreShape` sizes full-mode source to 400 lines and its full-mode
  hints no longer point at `mode:"full"`. Regression test
  `test/unit/output-budget.test.ts::budgetExploreShape keeps a 172-line source
  whole in full mode…` failed first (`ℹ pass 6 / ℹ fail 1`) and passes after
  the fix; output in `.red-before-fix.txt` under "rework 2 / T2". Manual:
  `compass_explore handleHarness mode:"full"` returns 172/172 source lines with
  no truncation entry.
- Gates: `npm run check && npm test` exit 0 — 985 tests, 985 pass, 0 fail;
  coverage 88.39% lines / 85.74% branches / 90.57% functions (68 s).
