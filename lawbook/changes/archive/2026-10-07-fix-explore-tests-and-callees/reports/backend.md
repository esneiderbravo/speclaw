# Backend checks — fix-explore-tests-and-callees (2026-10-06)

2026-10-06 · branch `fix/explore-tests-and-callees` (ships 2.0.10; `package.json` still 2.0.9 — bump is the coordinator's) · cwd `/Users/esneiderbravo/Projects/speclaw`, Node v24.17.0, darwin. Manual runs in throwaway copies under `/tmp/tester-fetc/` (see api.md / database.md).

Change type **bug**: red-before-green evidence is embedded verbatim in §3.

## 1. Gates & results

| Check | Command | Result |
|---|---|---|
| Lint + format | `npm run check` | exit 0 · "All matched files use Prettier code style!" · ESLint clean ✅ |
| Type-check + compile | `npm run build` | exit 0 · `tsc` strict + "copy-assets: copied assets for 3 module(s)" ✅ |
| Tests + coverage | `npm test` | exit 0 · `ℹ tests 869 · pass 869 · fail 0` · all files 86.85% lines / 83.85% branches / 89.06% funcs (floor 80%) ✅ |
| Lawbook validate | `node dist/cli/index.js lawbook validate fix-explore-tests-and-callees` | exit 0 · "✓ fix-explore-tests-and-callees is valid (1 delta spec(s))" · 37 advisory EARS warnings, plus "delta drops 4 requirement(s)" advisory (the four are retitled with req ids / `~1`→`~2`, intentional) ✅ |
| Coverage (change) | `node dist/cli/index.js coverage --change fix-explore-tests-and-callees --json` (after a schema-11 reindex) | exit 0 · 9 identified, 9 shallow/deep covered, **0 direct defects**; the six req ids all covered (impact-id-first utest/itest/impl; import-resolution utest/impl; schema-edge-membership itest/impl; affected-test-selection utest/itest/impl; compass-mcp-surface itest/impl; explore-file-path~2 itest/impl) ✅ |
| Coverage (canonical) | `node dist/cli/index.js coverage --json` | exit 1 · 1 item: `req~explore-file-path~1` missing impl/itest (tags renamed to `~2`) + orphan tags for the new ids; both resolve at sync (task 18) — expected pre-sync ⚠️ |
| Law verify (empty/stale index) | `node dist/cli/index.js verify` before reindex | exit 0 · 3 passed (vacuous: index had been wiped to 0 rows by the old session MCP build) |
| Law verify (populated schema-11 index) | `node dist/cli/index.js verify` after `index` | **exit 1** · 1 passed · 12 failed · 2 unknown — 12 × `drift~changed-semantic` on `src/modules/compass/query.ts` (`explore`/`impact`/`search` anchors sealed by capabilities `cli` and `lawbook-workflow`); 2 unknown laws (`compass-does-not-import-foundation` 30 unresolved refs, `shared-stays-inner` 28); 1 advisory `integrity~advisory-mismatch~1` on docs/compass.md ❌ |
| Law verify (main baseline, populated) | main binary on a copy of HEAD | exit 0 · 1 passed · 0 failed · 2 unknown (28 / **36** unresolved refs) — the unknowns pre-exist; the branch lowers the compass law's count 36→30 |
| Throwaway reseal proof | copy: `drift --reseal --capability cli` + `lawbook-workflow`, then `verify` | exit 0 (1 passed, 0 failed, 2 unknown) — but the reseal rewrites 2,629 lines of committed `lawbook/anchors/{cli,lawbook-workflow}.json` provenance (specId, commitSha, archivedAt, re-attributed paths); **not applied** to the repo |

## 2. Tests added / updated

New regression tests (each failed before its fix — see §3):

- `test/unit/affected.test.ts`: selects a declaration-less test file that calls the symbol inside a test callback (RC1/RC2) · selects a test file whose import spans several lines (RC3) · resolves a tsconfig paths alias import (RC4) · mode none yields a null command with a reason (RC6) · detects vitest, jest and node --test runners per package · groups a workspace-spanning selection into per-cwd commands · maps compiled node --test globs and drops coverage thresholds · leaves out helpers the node --test glob never runs · a leaf package inherits vitest or jest from a hoisting ancestor (S1) · node --test script flags keep their values and directory args are globs (S2).
- `test/integration/compass.test.ts`: callees list only resolved symbols and count the unresolved (RC7) · member calls on non-project receivers do not bind by name (RC5) · a function called only from a test callback lists that caller (RC1) · file-owner nodes are hidden from find and name explore (extended in Rework 3: search/find/graphData/compact map, barrel + symbol-less module) · path explore of a declaration-less file resolves to its file-owner node.
- `test/unit/impact.test.ts`: declaration-less importer appears in the reverse closure (RC2).
- `test/integration/db.test.ts`: schema 10 migrates to 11 and forces a reindex keeping embeddings · a schema-11 index without edges.spec gains it in place keeping embeddings · a failed 10 to 11 migration rolls back and keeps schema 10 · reindex after migration recomputes no unchanged embedding · schema 9 migrates through 10 to 11 via openDb keeping embeddings.
- `test/integration/hotspots.test.ts`: coupling in_graph ignores member and builtin calls in its by-name fallback (O16).
- `test/integration/affected-tests.test.ts`: CLI affected-tests reports the command contract in JSON and text.
- `test/unit/resolve-edges.test.ts` (new, 13 tests): resolveEdges with and without fileIds matches a full index (equivalence + no NULL `src_node_id`) · imports resolve through relative, multi-line, paths, and baseUrl forms · stripJsonComments … · importBindings … · an import longer than the stored cap still resolves (M1) · a global builtin call never binds to a same-named project function (M2) · package-namespace receivers are foreign (S3) · scoped-looking paths aliases / single-segment baseUrl bind to project code (N1) · an imported project function named like a builtin keeps its cross-file callers (O13) · Nx paths alias over a pure re-export barrel / relative index barrel / barrel-directory preference (N2).

Changed expectations, each justified:

| Test | Old → new | Justification |
|---|---|---|
| `compass.test.ts` explore path cases, `src/blank.ts` | `found: false` → `found: true`, `kind: "file"`, `callees: []` | D9 (Rework 3): every symbol-less file gets a hidden file-owner node so imports of it resolve; `req~explore-file-path~2` scenario "Symbol-less file without references resolves to its file-owner node". Message still matches `/no symbols/`. |
| `compass.test.ts`, every `// Covers:` | `req~explore-file-path~1` → `~2` | D13: the old text said path resolution "invents no file-level nodes". |
| `reindex.test.ts` no-op totals | `nodes` = `COUNT(*) FROM nodes` → `… WHERE kind <> 'file'` | §1.2: `totals.nodes` counts symbols only; file-owner nodes are hidden (this repo: 1328 rows − 238 file nodes = 1090 reported). |
| `metrics.test.ts` | title "schema 9" → "current schema"; `SCHEMA_VERSION` `"10"` → `"11"` | D1 schema bump. |
| `affected.test.ts` "selects only reachable tests" fixture | top-level `export function testAdd()` tests, one-line imports → declaration-less `test(...)` callbacks, multi-line import | bugfix.md §3: the old fixture masked RC1–RC3; assertions unchanged except `res.command` read through the nullable contract (`command ?? ""`). |

## 3. Red-before-green evidence (verbatim)

Re-confirmed green on the final tree (this session, `node --test --test-concurrency=1 …` on freshly compiled `dist-test`):

| Red set | Red | Green now |
|---|---|---|
| original (affected, compass, impact, db) | 16 of 45 failing | `ℹ tests 51 · pass 51 · fail 0` (set grew in reworks) |
| Rework 1 (resolve-edges, db, affected) | 5 of 28 failing | `ℹ tests 35 · pass 35 · fail 0` |
| Rework 2 (resolve-edges) | 3 of 10 failing | `ℹ tests 13 · pass 13 · fail 0` |
| Rework 3 (resolve-edges, compass, hotspots) | 5 of 34 failing | `ℹ tests 34 · pass 34 · fail 0` (.green-rework3) |


### `.red-before-fix.txt`

````text
# Red before fix — fix-explore-tests-and-callees
# date: 2026-10-07T02:08:51Z · branch: fix/explore-tests-and-callees · HEAD: 74c5a7a · src/ unchanged (git status --short src: '')
# command: npm run pretest && node --test --test-concurrency=1 dist-test/test/unit/affected.test.js dist-test/test/integration/compass.test.js dist-test/test/unit/impact.test.js dist-test/test/integration/db.test.js
# exit code: 1 (16 of 45 failing; every failing case is a new or reworked regression test)

✔ buildIndex parses a multi-language repo into nodes, edges, and embeddings (57.280292ms)
✔ search finds a node by name substring (21.194625ms)
✔ explore returns source, callees, and callers for an exact node (14.705667ms)
✔ explore falls back to fuzzy matches when no exact node exists (15.555417ms)
✔ explore returns exact source after multibyte text (13.486042ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (32.2685ms)
✔ recall ranks nodes by semantic similarity (14.40875ms)
✔ impact walks callers transitively (12.81775ms)
✔ trace finds a call path, handles identity, and reports no route (12.814375ms)
✔ query functions throw when no index has been built (0.6705ms)
✔ visualize writes an HTML graph, with and without a focus node (13.638791ms)
✔ graphData throws without an index (0.269875ms)
✔ buildIndex is incremental — unchanged files are skipped, removed files pruned (17.291083ms)
✖ callees list only resolved symbols and count the unresolved (14.322833ms)
✖ member calls on non-project receivers do not bind by name (9.623292ms)
✖ a function called only from a test callback lists that caller (9.177458ms)
✖ file-owner nodes are hidden from find and name explore (12.9945ms)
✖ path explore of a declaration-less file resolves to its file-owner node (10.31ms)
✔ openDb creates the index, applies the schema, and stamps the version (8.0615ms)
✔ openDb reopens an up-to-date database without dropping data (7.409ms)
✔ openDb rebuilds a database stamped with an incompatible schema version (14.873541ms)
✖ schema 10 migrates to 11 and forces a reindex keeping embeddings (11.648292ms)
✖ a failed 10 to 11 migration rolls back and keeps schema 10 (9.073375ms)
✔ buildTestCommand prefers package.json scripts.test (1.403916ms)
✖ affectedTests selects only reachable tests (51.018416ms)
✖ selects a declaration-less test file that calls the symbol inside a test callback (15.218709ms)
✖ selects a test file whose import spans several lines (13.791417ms)
✖ resolves a tsconfig paths alias import (16.417667ms)
✖ mode none yields a null command with a reason (16.42725ms)
✖ detects vitest, jest and node --test runners per package (18.800542ms)
✖ groups a workspace-spanning selection into per-cwd commands (15.926125ms)
✖ maps compiled node --test globs and drops coverage thresholds (12.682ms)
✔ global lockfile selects full suite (10.518292ms)
✔ malformed config fails before selection (9.378792ms)
✔ matchGlob supports braces and stars (0.640291ms)
✔ defaults mark test paths and modules (0.218375ms)
✔ missing affected.json loads defaults (0.652541ms)
✔ invalid affected.json fails fast (0.85625ms)
✔ impact prefers node id over colliding names (44.018833ms)
✔ impact finds import-only dependents (12.007583ms)
✔ impact with call-only omits pure importers (10.8585ms)
✔ global file reports repo blast radius (10.308084ms)
✔ grouped impact caps module representatives (18.976458ms)
✔ cyclic callers terminate (10.94525ms)
✖ declaration-less importer appears in the reverse closure (12.458166ms)
ℹ tests 45
ℹ suites 0
ℹ pass 29
ℹ fail 16
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1146.460625

✖ failing tests:

test at dist-test/test/integration/compass.test.js:235:1
✖ callees list only resolved symbols and count the unresolved (14.322833ms)
  AssertionError [ERR_ASSERTION]: [{"name":"helper2","file":"src/caller.ts","line":3},{"name":"push","line":4},{"name":"map","line":5},{"name":"log","line":6},{"name":"helper2","file":"src/caller.ts","line":7}]
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:250:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/integration/compass.test.js:257:1
✖ member calls on non-project receivers do not bind by name (9.623292ms)
  Error: no such column: e.is_member
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:275:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    code: 'ERR_SQLITE_ERROR',
    errcode: 1,
    errstr: 'SQL logic error'
  }

test at dist-test/test/integration/compass.test.js:291:1
✖ a function called only from a test callback lists that caller (9.177458ms)
  AssertionError [ERR_ASSERTION]: []
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:296:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/integration/compass.test.js:304:1
✖ file-owner nodes are hidden from find and name explore (12.9945ms)
  AssertionError [ERR_ASSERTION]: only files with orphan references get a file-owner node
  + actual - expected
  
  + []
  - [
  -   'src/main.ts',
  -   'test/a.test.ts'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:324:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [],
    expected: [ 'src/main.ts', 'test/a.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/compass.test.js:334:1
✖ path explore of a declaration-less file resolves to its file-owner node (10.31ms)
  AssertionError [ERR_ASSERTION]: Indexed file "test/a.test.ts" has no symbols.
  
  false !== true
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:339:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/db.test.js:58:1
✖ schema 10 migrates to 11 and forces a reindex keeping embeddings (11.648292ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(cols.includes("is_member"))
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/db.test.js:66:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/integration/db.test.js:73:1
✖ a failed 10 to 11 migration rolls back and keeps schema 10 (9.073375ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/db.test.js:82:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /10→11/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:32:1
✖ affectedTests selects only reachable tests (51.018416ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + []
  - [
  -   'src/lib.test.ts'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:62:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [],
    expected: [ 'src/lib.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:67:1
✖ selects a declaration-less test file that calls the symbol inside a test callback (15.218709ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + []
  - [
  -   'test/math.test.ts'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:73:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [],
    expected: [ 'test/math.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:78:1
✖ selects a test file whose import spans several lines (13.791417ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + []
  - [
  -   'test/a.test.ts'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:93:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [],
    expected: [ 'test/a.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:96:1
✖ resolves a tsconfig paths alias import (16.417667ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + []
  - [
  -   'apps/web/test/x.test.ts'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:119:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [],
    expected: [ 'apps/web/test/x.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:124:1
✖ mode none yields a null command with a reason (16.42725ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'npm test -- --test-name-pattern=^$'
  - null
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:131:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'npm test -- --test-name-pattern=^$',
    expected: null,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:148:1
✖ detects vitest, jest and node --test runners per package (18.800542ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + undefined
  - [
  -   {
  -     command: 'npx vitest run test/w.test.ts',
  -     cwd: 'apps/web',
  -     files: [
  -       'test/w.test.ts'
  -     ]
  -   }
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:153:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: [ { cwd: 'apps/web', command: 'npx vitest run test/w.test.ts', files: [Array] } ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:166:1
✖ groups a workspace-spanning selection into per-cwd commands (15.926125ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + undefined
  - [
  -   'apps/web',
  -   'packages/core'
  - ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:171:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: [ 'apps/web', 'packages/core' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:177:1
✖ maps compiled node --test globs and drops coverage thresholds (12.682ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'npm test -- --test-name-pattern=^$'
  - 'npm run pretest && node --test --test-concurrency=1 dist-test/test/unit/a.test.js'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:189:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'npm test -- --test-name-pattern=^$',
    expected: 'npm run pretest && node --test --test-concurrency=1 dist-test/test/unit/a.test.js',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/impact.test.js:105:1
✖ declaration-less importer appears in the reverse closure (12.458166ms)
  AssertionError [ERR_ASSERTION]: []
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/impact.test.js:115:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
````

### `.green-after-fix.txt`

````text
# Green after fix — same command as .red-before-fix.txt
# date: 2026-10-07T02:16:45Z · branch: fix/explore-tests-and-callees
# exit code: 0

✔ buildIndex parses a multi-language repo into nodes, edges, and embeddings (53.841958ms)
✔ search finds a node by name substring (16.813333ms)
✔ explore returns source, callees, and callers for an exact node (14.773417ms)
✔ explore falls back to fuzzy matches when no exact node exists (12.754834ms)
✔ explore returns exact source after multibyte text (11.652875ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (33.034959ms)
✔ recall ranks nodes by semantic similarity (15.3765ms)
✔ impact walks callers transitively (21.616917ms)
✔ trace finds a call path, handles identity, and reports no route (15.101292ms)
✔ query functions throw when no index has been built (0.755458ms)
✔ visualize writes an HTML graph, with and without a focus node (12.635583ms)
✔ graphData throws without an index (0.288625ms)
✔ buildIndex is incremental — unchanged files are skipped, removed files pruned (13.651416ms)
✔ callees list only resolved symbols and count the unresolved (9.347333ms)
✔ member calls on non-project receivers do not bind by name (11.727417ms)
✔ a function called only from a test callback lists that caller (12.920417ms)
✔ file-owner nodes are hidden from find and name explore (28.605583ms)
✔ path explore of a declaration-less file resolves to its file-owner node (14.707083ms)
✔ openDb creates the index, applies the schema, and stamps the version (7.661291ms)
✔ openDb reopens an up-to-date database without dropping data (8.039083ms)
✔ openDb rebuilds a database stamped with an incompatible schema version (15.238167ms)
✔ schema 10 migrates to 11 and forces a reindex keeping embeddings (10.079416ms)
✔ a failed 10 to 11 migration rolls back and keeps schema 10 (9.311375ms)
✔ buildTestCommand prefers package.json scripts.test (1.916375ms)
✔ affectedTests selects only reachable tests (50.165292ms)
✔ selects a declaration-less test file that calls the symbol inside a test callback (16.5025ms)
✔ selects a test file whose import spans several lines (12.052917ms)
✔ resolves a tsconfig paths alias import (20.125708ms)
✔ mode none yields a null command with a reason (12.646041ms)
✔ detects vitest, jest and node --test runners per package (22.668375ms)
✔ groups a workspace-spanning selection into per-cwd commands (15.625041ms)
✔ maps compiled node --test globs and drops coverage thresholds (11.676292ms)
✔ global lockfile selects full suite (10.501542ms)
✔ malformed config fails before selection (7.697583ms)
✔ matchGlob supports braces and stars (0.653667ms)
✔ defaults mark test paths and modules (0.21775ms)
✔ missing affected.json loads defaults (0.645541ms)
✔ invalid affected.json fails fast (0.810667ms)
✔ impact prefers node id over colliding names (43.377375ms)
✔ impact finds import-only dependents (11.945875ms)
✔ impact with call-only omits pure importers (12.19425ms)
✔ global file reports repo blast radius (10.964917ms)
✔ grouped impact caps module representatives (18.677208ms)
✔ cyclic callers terminate (10.617375ms)
✔ declaration-less importer appears in the reverse closure (11.17525ms)
ℹ tests 45
ℹ suites 0
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1076.214708
````

### `.red-rework1.txt`

````text
# Rework 1 red run — new regression tests against src/ before the rework fixes
# date: 2026-10-07T02:35:45Z  branch: fix/explore-tests-and-callees
# cmd: npx tsc -p tsconfig.test.json && node scripts/prep-test-assets.mjs && node --test --test-concurrency=1 dist-test/test/unit/resolve-edges.test.js dist-test/test/integration/db.test.js dist-test/test/unit/affected.test.js

✔ openDb creates the index, applies the schema, and stamps the version (10.191ms)
✔ openDb reopens an up-to-date database without dropping data (7.430042ms)
✔ openDb rebuilds a database stamped with an incompatible schema version (21.668833ms)
✔ schema 10 migrates to 11 and forces a reindex keeping embeddings (13.90725ms)
✔ a failed 10 to 11 migration rolls back and keeps schema 10 (18.1865ms)
✔ reindex after migration recomputes no unchanged embedding (80.077083ms)
✔ schema 9 migrates through 10 to 11 via openDb keeping embeddings (20.845541ms)
✔ buildTestCommand prefers package.json scripts.test (1.785792ms)
✔ affectedTests selects only reachable tests (49.944834ms)
✔ selects a declaration-less test file that calls the symbol inside a test callback (15.670958ms)
✔ selects a test file whose import spans several lines (13.960833ms)
✔ resolves a tsconfig paths alias import (17.543833ms)
✔ mode none yields a null command with a reason (12.825709ms)
✔ detects vitest, jest and node --test runners per package (22.841958ms)
✔ groups a workspace-spanning selection into per-cwd commands (22.526333ms)
✔ maps compiled node --test globs and drops coverage thresholds (12.761375ms)
✔ global lockfile selects full suite (9.712708ms)
✔ malformed config fails before selection (14.392375ms)
✔ leaves out helpers the node --test glob never runs (15.415333ms)
✖ a leaf package inherits vitest or jest from a hoisting ancestor (2.262875ms)
✖ node --test script flags keep their values and directory args are globs (0.64025ms)
✔ resolveEdges with and without fileIds matches a full index (53.336708ms)
✔ imports resolve through relative, multi-line, paths, and baseUrl forms (12.307125ms)
✔ stripJsonComments keeps strings and drops comments and trailing commas (0.194041ms)
✔ importBindings lists the local names an import binds (0.265166ms)
✖ an import longer than the stored cap still resolves and keeps its bindings (19.448375ms)
✖ a global builtin call never binds to a same-named project function (16.601834ms)
✖ member calls on a package-namespace receiver are foreign (10.427541ms)
ℹ tests 28
ℹ suites 0
ℹ pass 23
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1092.090833

✖ failing tests:

test at dist-test/test/unit/affected.test.js:233:1
✖ a leaf package inherits vitest or jest from a hoisting ancestor (2.262875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'cd packages/x && node --test src/a.test.ts'
  - 'cd packages/x && npx vitest run src/a.test.ts'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:240:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'cd packages/x && node --test src/a.test.ts',
    expected: 'cd packages/x && npx vitest run src/a.test.ts',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/affected.test.js:246:1
✖ node --test script flags keep their values and directory args are globs (0.64025ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'node --import --test 80 --test-reporter spec test/unit/a.test.ts'
  - 'node --import ./register.mjs --test --test-reporter spec test/unit/a.test.ts'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/affected.test.js:254:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'node --import --test 80 --test-reporter spec test/unit/a.test.ts',
    expected: 'node --import ./register.mjs --test --test-reporter spec test/unit/a.test.ts',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:129:1
✖ an import longer than the stored cap still resolves and keeps its bindings (19.448375ms)
  AssertionError [ERR_ASSERTION]: the from clause is kept
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:147:16)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'import { generatedTypeNumber0, generatedTypeNumber1, generatedTypeNumber2, generatedTypeNumber3, generatedTypeNumber4, generatedTypeNumber5, generatedTypeNumber6, generatedTypeNumber7, generatedTypeNumber8, generatedTypeNumber9, generatedTypeNumber10, generatedTypeNumber11, generatedTypeNumber12, generatedTypeNumber13, generatedTypeNumber14, generatedTypeNumber15, generatedTypeNumber16, generatedTypeNumber17, generatedTypeNumber18, generatedTypeNumber19, generatedTypeNumber20, generatedTypeNumber21, generatedTypeNumber22, generatedTypeNumber23, generatedTypeNumber24, generatedTypeNumber25, generatedTypeNumber26, generatedTypeNumber27, generatedTypeNumber28, generatedTypeNumber29, generatedTypeNumber30, generatedTypeNumber31, generatedTypeNumber32, generatedTypeNumber33, generatedTypeNumber34, generatedTypeNumber35, generatedTypeNumber36, generatedTypeNumber37, generatedTypeNumber38, generatedTypeNumber39, generatedTypeNumber40, generatedTypeNumber41, generatedTypeNumber42, generatedTypeNumber43, generatedType',
    expected: /from "\.\/gql\/graphql\.js";$/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:159:1
✖ a global builtin call never binds to a same-named project function (16.601834ms)
  AssertionError [ERR_ASSERTION]: [{"name":"runAll","kind":"function","file":"src/runner.ts","line":2},{"name":"test/x.test.ts","kind":"file","file":"test/x.test.ts","line":1}]
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:185:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:191:1
✖ member calls on a package-namespace receiver are foreign (10.427541ms)
  AssertionError [ERR_ASSERTION]: [{"name":"pick","kind":"function","file":"src/use.ts","line":5},{"name":"own","kind":"function","file":"src/use.ts","line":8}]
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:208:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
````

### `.red-rework2.txt`

````text
# Rework 2 red run (N1 + O13)
# Command: npx tsc -p tsconfig.test.json && node scripts/prep-test-assets.mjs && node --test --test-concurrency=1 dist-test/test/unit/resolve-edges.test.js
# src/ state: post-Rework-1 (isPackageSpecifier at extract time), tests from Rework 2 added first.
# Expected red: the @app/* + @myorg/core paths-alias test, the baseUrl single-segment test, and the imported-builtin (O13) test.
# The S3 package test (path.parse/_.parse) passes before and after.

✔ resolveEdges with and without fileIds matches a full index (54.545458ms)
✔ imports resolve through relative, multi-line, paths, and baseUrl forms (11.863875ms)
✔ stripJsonComments keeps strings and drops comments and trailing commas (0.12ms)
✔ importBindings lists the local names an import binds (0.238375ms)
✔ an import longer than the stored cap still resolves and keeps its bindings (14.335583ms)
✔ a global builtin call never binds to a same-named project function (12.551167ms)
✔ member calls on a package-namespace receiver are foreign (10.793958ms)
✖ member calls through scoped-looking paths aliases bind to project code (14.744875ms)
✖ member calls through a single-segment baseUrl module bind to project code (13.074042ms)
✖ an imported project function named like a builtin keeps its cross-file callers (11.996416ms)
ℹ tests 10
ℹ suites 0
ℹ pass 7
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 316.132

✖ failing tests:

test at dist-test/test/unit/resolve-edges.test.js:220:1
✖ member calls through scoped-looking paths aliases bind to project code (14.744875ms)
  AssertionError [ERR_ASSERTION]: getUser: {"explore":[],"impact":[]}
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:234:16)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:239:1
✖ member calls through a single-segment baseUrl module bind to project code (13.074042ms)
  AssertionError [ERR_ASSERTION]: {"explore":[],"impact":[]}
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:250:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:254:1
✖ an imported project function named like a builtin keeps its cross-file callers (11.996416ms)
  AssertionError [ERR_ASSERTION]: {"explore":[],"impact":[]}
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:265:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
````

### `.red-rework3.txt`

````text
# Rework 3 red run — new/extended tests against the post-Rework-2 src/ (no src/ edit yet)
# date: 2026-10-07T02:58:44Z · branch: fix/explore-tests-and-callees · HEAD 74c5a7a + working tree
# cmd: npm run pretest && node --test --test-concurrency=1 dist-test/test/unit/resolve-edges.test.js dist-test/test/integration/compass.test.js dist-test/test/integration/hotspots.test.js

✔ buildIndex parses a multi-language repo into nodes, edges, and embeddings (54.948125ms)
✔ search finds a node by name substring (18.585917ms)
✔ explore returns source, callees, and callers for an exact node (15.76475ms)
✔ explore falls back to fuzzy matches when no exact node exists (14.171ms)
✔ explore returns exact source after multibyte text (11.370541ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (36.951333ms)
✔ recall ranks nodes by semantic similarity (14.563666ms)
✔ impact walks callers transitively (13.68225ms)
✔ trace finds a call path, handles identity, and reports no route (14.804ms)
✔ query functions throw when no index has been built (0.721917ms)
✔ visualize writes an HTML graph, with and without a focus node (14.904875ms)
✔ graphData throws without an index (0.312ms)
✔ buildIndex is incremental — unchanged files are skipped, removed files pruned (15.781375ms)
✔ callees list only resolved symbols and count the unresolved (10.75425ms)
✔ member calls on non-project receivers do not bind by name (11.915791ms)
✔ a function called only from a test callback lists that caller (13.858958ms)
✖ file-owner nodes are hidden from find and name explore (17.029542ms)
✔ path explore of a declaration-less file resolves to its file-owner node (17.719458ms)
✔ schema 9 creates node_metrics and reindexes from 7 (48.132792ms)
✔ CLI hotspots and coupling emit JSON without branded header (368.657167ms)
✖ coupling in_graph ignores member and builtin calls in its by-name fallback (192.944333ms)
✔ resolveEdges with and without fileIds matches a full index (54.564291ms)
✔ imports resolve through relative, multi-line, paths, and baseUrl forms (12.637875ms)
✔ stripJsonComments keeps strings and drops comments and trailing commas (0.113584ms)
✔ importBindings lists the local names an import binds (0.256084ms)
✔ an import longer than the stored cap still resolves and keeps its bindings (14.29075ms)
✔ a global builtin call never binds to a same-named project function (14.102ms)
✔ member calls on a package-namespace receiver are foreign (11.40925ms)
✔ member calls through scoped-looking paths aliases bind to project code (19.178792ms)
✔ member calls through a single-segment baseUrl module bind to project code (11.363125ms)
✔ an imported project function named like a builtin keeps its cross-file callers (10.815042ms)
✖ member calls through an Nx paths alias over a pure re-export barrel bind (11.650167ms)
✖ member calls through a relative index barrel of re-exports bind (11.057875ms)
✖ a call through a barrel prefers a definition under the barrel's directory (14.04ms)
ℹ tests 34
ℹ suites 0
ℹ pass 29
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1399.8485

✖ failing tests:

test at dist-test/test/integration/compass.test.js:306:1
✖ file-owner nodes are hidden from find and name explore (17.029542ms)
  AssertionError [ERR_ASSERTION]: files with orphan references, re-exports, or no symbols get a file-owner node
  + actual - expected
  
    [
  -   'src/consts.ts',
  -   'src/index.ts',
      'src/main.ts',
      'test/a.test.ts'
    ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:329:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'src/main.ts', 'test/a.test.ts' ],
    expected: [ 'src/consts.ts', 'src/index.ts', 'src/main.ts', 'test/a.test.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/hotspots.test.js:67:1
✖ coupling in_graph ignores member and builtin calls in its by-name fallback (192.944333ms)
  AssertionError [ERR_ASSERTION]: [{"file":"src/own.ts","both":2,"commitsSelf":2,"commitsOther":2,"strength":1,"inGraph":true,"isTestPair":false},{"file":"src/use.ts","both":2,"commitsSelf":2,"commitsOther":2,"strength":1,"inGraph":true,"isTestPair":false}]
  
  true !== false
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/hotspots.test.js:92:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:321:1
✖ member calls through an Nx paths alias over a pure re-export barrel bind (11.650167ms)
  AssertionError [ERR_ASSERTION]: the barrel import resolves to the barrel's file-owner node
  + actual - expected
  
  + null
  - {
  -   kind: 'file',
  -   path: 'libs/core/src/index.ts'
  - }
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:332:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { kind: 'file', path: 'libs/core/src/index.ts' },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:339:1
✖ member calls through a relative index barrel of re-exports bind (11.057875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   kind: 'file',
  -   path: 'src/api/index.ts'
  - }
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:350:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: { kind: 'file', path: 'src/api/index.ts' },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/resolve-edges.test.js:361:1
✖ a call through a barrel prefers a definition under the barrel's directory (14.04ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      {
        m: 0,
  +     path: 'src/legacy/boot.ts'
  -     path: 'libs/core/src/lib/core.ts'
      },
      {
        m: 2,
  +     path: null
  -     path: 'libs/core/src/lib/core.ts'
      }
    ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/resolve-edges.test.js:386:16)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { m: 0, path: 'src/legacy/boot.ts' }, { m: 2, path: null } ],
    expected: [ { m: 0, path: 'libs/core/src/lib/core.ts' }, { m: 2, path: 'libs/core/src/lib/core.ts' } ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
````

### `.green-rework3.txt`

````text
# Rework 3 green run — same tests after the fix
# date: 2026-10-07T03:04:55Z · cmd: npm test (pretest compiled) then node --test --test-concurrency=1 dist-test/test/unit/resolve-edges.test.js dist-test/test/integration/compass.test.js dist-test/test/integration/hotspots.test.js
# full npm test on the same tree: ℹ tests 869 ℹ pass 869 ℹ fail 0 

✔ buildIndex parses a multi-language repo into nodes, edges, and embeddings (53.857916ms)
✔ search finds a node by name substring (16.234833ms)
✔ explore returns source, callees, and callers for an exact node (15.543709ms)
✔ explore falls back to fuzzy matches when no exact node exists (12.696333ms)
✔ explore returns exact source after multibyte text (12.271625ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (33.42ms)
✔ recall ranks nodes by semantic similarity (12.33425ms)
✔ impact walks callers transitively (14.225709ms)
✔ trace finds a call path, handles identity, and reports no route (15.128125ms)
✔ query functions throw when no index has been built (0.929083ms)
✔ visualize writes an HTML graph, with and without a focus node (13.189959ms)
✔ graphData throws without an index (0.347667ms)
✔ buildIndex is incremental — unchanged files are skipped, removed files pruned (14.38225ms)
✔ callees list only resolved symbols and count the unresolved (10.279625ms)
✔ member calls on non-project receivers do not bind by name (14.1575ms)
✔ a function called only from a test callback lists that caller (14.743583ms)
✔ file-owner nodes are hidden from find and name explore (76.643916ms)
✔ path explore of a declaration-less file resolves to its file-owner node (14.151458ms)
✔ schema 9 creates node_metrics and reindexes from 7 (47.313042ms)
✔ CLI hotspots and coupling emit JSON without branded header (368.391542ms)
✔ coupling in_graph ignores member and builtin calls in its by-name fallback (185.698875ms)
✔ resolveEdges with and without fileIds matches a full index (53.728541ms)
✔ imports resolve through relative, multi-line, paths, and baseUrl forms (13.582584ms)
✔ stripJsonComments keeps strings and drops comments and trailing commas (0.127166ms)
✔ importBindings lists the local names an import binds (0.2875ms)
✔ an import longer than the stored cap still resolves and keeps its bindings (15.049583ms)
✔ a global builtin call never binds to a same-named project function (13.669917ms)
✔ member calls on a package-namespace receiver are foreign (11.020208ms)
✔ member calls through scoped-looking paths aliases bind to project code (17.482083ms)
✔ member calls through a single-segment baseUrl module bind to project code (11.2705ms)
✔ an imported project function named like a builtin keeps its cross-file callers (12.029375ms)
✔ member calls through an Nx paths alias over a pure re-export barrel bind (13.071209ms)
✔ member calls through a relative index barrel of re-exports bind (14.639417ms)
✔ a call through a barrel prefers a definition under the barrel's directory (14.315875ms)
ℹ tests 34
ℹ suites 0
ℹ pass 34
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1391.9415
````

## 4. Spec-scenario coverage

Every `#### Scenario` of the delta `specs/code-graph/spec.md` (117), generated and checked for completeness:

| Requirement | Scenario | Verified by |
|---|---|---|
| Id-first reverse reachability req~impact-id-first~1 | Id-resolved edge is preferred over name match | `impact.test.ts` · impact prefers node id over colliding names |
| Id-first reverse reachability req~impact-id-first~1 | Name-resolved results are flagged | unchanged arm of `req~impact-id-first~1`; full suite green (no dedicated test title; pre-existing) |
| Id-first reverse reachability req~impact-id-first~1 | Import-only dependent is found | `impact.test.ts` · impact finds import-only dependents |
| Id-first reverse reachability req~impact-id-first~1 | Declaration-less importer is found | `impact.test.ts` · declaration-less importer appears in the reverse closure (red→green); manual: hooks.test.ts selected for `compileHooks` |
| Id-first reverse reachability req~impact-id-first~1 | Calls in callbacks have an owner | `compass.test.ts` · a function called only from a test callback lists that caller; invariant 0 NULL `src_node_id` (manual, this repo + 9/10→11 copies); manual: mono fixture `price`/`add`/`fmt` callers |
| Id-first reverse reachability req~impact-id-first~1 | Member calls on foreign receivers are not bound by name | `compass.test.ts` · member calls on non-project receivers do not bind by name; manual: `compileHooks` callees show `push/map/...` only in `unresolvedCallees` |
| Id-first reverse reachability req~impact-id-first~1 | Builtin globals bind only within the file | `resolve-edges.test.ts` · a global builtin call never binds to a same-named project function |
| Id-first reverse reachability req~impact-id-first~1 | Package-namespace receivers are foreign | `resolve-edges.test.ts` · member calls on a package-namespace receiver are foreign |
| Id-first reverse reachability req~impact-id-first~1 | Scoped-looking paths aliases are project code | `resolve-edges.test.ts` · member calls through scoped-looking paths aliases bind to project code |
| Id-first reverse reachability req~impact-id-first~1 | Pure re-export barrels are project code | `resolve-edges.test.ts` · Nx paths alias over a pure re-export barrel / relative index barrel; manual: mono `@myorg/core` barrel → `boot` caller `apps/web/test/boot.test.ts` |
| Id-first reverse reachability req~impact-id-first~1 | A call through a barrel prefers the barrel's subtree | `resolve-edges.test.ts` · a call through a barrel prefers a definition under the barrel's directory |
| Id-first reverse reachability req~impact-id-first~1 | Single-segment baseUrl modules are project code | `resolve-edges.test.ts` · member calls through a single-segment baseUrl module bind to project code |
| Id-first reverse reachability req~impact-id-first~1 | An imported project function named like a builtin binds across files | `resolve-edges.test.ts` · an imported project function named like a builtin keeps its cross-file callers |
| Id-first reverse reachability req~impact-id-first~1 | Restricting edge kinds excludes imports | `impact.test.ts` · impact with call-only omits pure importers |
| Id-first reverse reachability req~impact-id-first~1 | A cyclic graph terminates | `impact.test.ts` · cyclic callers terminate |
| Import resolution req~import-resolution~1 | Multi-line import resolves | `affected.test.ts` · selects a test file whose import spans several lines; `resolve-edges.test.ts` · imports resolve through relative, multi-line, paths, and baseUrl forms; manual: mono + Farmatodo multi-line imports |
| Import resolution req~import-resolution~1 | An import longer than the cap still resolves | `resolve-edges.test.ts` · an import longer than the stored cap still resolves and keeps its bindings |
| Import resolution req~import-resolution~1 | tsconfig paths alias resolves per workspace | `affected.test.ts` · resolves a tsconfig paths alias import; manual: mono `@/lib/price` (apps/web tsconfig, JSONC base with `extends`) and Farmatodo copy `@/*` → expense-distribution.spec.ts selected |
| Import resolution req~import-resolution~1 | Malformed tsconfig does not fail indexing | `resolve-edges.test.ts` · stripJsonComments keeps strings and drops comments and trailing commas (+ never-throws path in the alias resolver); manual: mono base tsconfig with comments/trailing commas indexed |
| Grouped blast-radius output | Large blast radius is summarised | `impact.test.ts` · grouped impact caps module representatives (unchanged req (verbatim from canonical); regression: full `npm test` 869/869) |
| Grouped blast-radius output | Flat format is available on request | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Grouped blast-radius output | Ambiguous symbol name is announced | unchanged req (verbatim from canonical); regression: full `npm test` 869/869; `compass.test.ts` explore ambiguous basename case |
| Global files never report empty impact | Touching tsconfig is repo-wide | `impact.test.ts` · global file reports repo blast radius |
| Global files never report empty impact | Test-only change is empty for build target | `affected-tests.test.ts`/`impact.test.ts` · build target empties for test-only change |
| Schema records test and module metadata | Schema 7 database is rebuilt on open | `db.test.ts` · openDb rebuilds a database stamped with an incompatible schema version; opening a schema-6 stamped db forces reindex marker |
| Schema records test and module metadata | Schema 9 migrates forward without wiping embeddings | `db.test.ts` · schema 9 migrates through 10 to 11 via openDb keeping embeddings; manual: 9→11 on a copy (0 computed, 1090 fromCache) |
| Schema records test and module metadata | Test files are marked at index time | `hotspots.test.ts`/`db.test.ts` · schema 7 stamps is_test and module on files |
| Schema 11 edge membership migration req~schema-edge-membership~1 | Schema 10 migrates to 11 and keeps embeddings | `db.test.ts` · schema 10 migrates to 11 and forces a reindex keeping embeddings (red→green); manual: 10→11 on a copy (0 computed, 1051 fromCache, NULL owners 8709→0) |
| Schema 11 edge membership migration req~schema-edge-membership~1 | A schema-11 index without edges.spec migrates in place | `db.test.ts` · a schema-11 index without edges.spec gains it in place keeping embeddings |
| Schema 11 edge membership migration req~schema-edge-membership~1 | Reindex after migration recomputes no unchanged embedding | `db.test.ts` · reindex after migration recomputes no unchanged embedding; manual 9→11 and 10→11 copies: `0 computed` |
| Schema 11 edge membership migration req~schema-edge-membership~1 | Failed 10 to 11 migration rolls back | `db.test.ts` · a failed 10 to 11 migration rolls back and keeps schema 10 |
| Static affected-test selection req~affected-test-selection~1 | Only reachable tests are selected | `affected.test.ts` · affectedTests selects only reachable tests (fixture reworked to realistic shapes); manual: this repo hooks.ts → 20 files, command ran 263/263 = sum of per-file counts |
| Static affected-test selection req~affected-test-selection~1 | Nothing selected yields no command | `affected.test.ts` · mode none yields a null command with a reason; `affected-tests.test.ts` CLI contract; manual: README.md on this repo and mono → `command: null`, `no command: …` |
| Static affected-test selection req~affected-test-selection~1 | Vitest package gets a non-watch command | `affected.test.ts` · detects vitest, jest and node --test runners per package; manual: mono `cd apps/web && npx vitest run …`, Farmatodo copy `cd apps/web && npx vitest run …` |
| Static affected-test selection req~affected-test-selection~1 | Compiled node test layout is mapped | `affected.test.ts` · maps compiled node --test globs and drops coverage thresholds; manual: this repo `npm run pretest && node --test --test-concurrency=1 dist-test/…` executed, exit 0, no coverage report |
| Static affected-test selection req~affected-test-selection~1 | Hoisted runner is inherited | `affected.test.ts` · a leaf package inherits vitest or jest from a hoisting ancestor; manual: mono `packages/hoisted` → `cd packages/hoisted && npx vitest run src/fmt.test.ts` |
| Static affected-test selection req~affected-test-selection~1 | Node test flag values stay with their flags | `affected.test.ts` · node --test script flags keep their values and directory args are globs |
| Static affected-test selection req~affected-test-selection~1 | Directory argument selects the files under it | `affected.test.ts` · node --test script flags keep their values and directory args are globs |
| Static affected-test selection req~affected-test-selection~1 | Workspace-spanning selection lists every group | `affected.test.ts` · groups a workspace-spanning selection into per-cwd commands; manual: mono 3 groups (vitest/jest/inherited vitest) compound command executed with stub `npx`, every path resolved in its cwd |
| Static affected-test selection req~affected-test-selection~1 | Global file selects the full suite | `impact.test.ts` · global lockfile selects full suite; manual: `--file package-lock.json` → mode all, `npm test` |
| Static affected-test selection req~affected-test-selection~1 | Unindexed language degrades loudly | `impact.test.ts`/`affected.test.ts` · unindexed language warns |
| Static affected-test selection req~affected-test-selection~1 | Diff mode uses git changed files | `affected-tests.test.ts` · affected-tests --from-diff seeds from git changed files |
| Optional affected configuration | Missing config uses defaults | `impact.test.ts` · missing affected.json loads defaults |
| Schema records per-symbol health metrics | Nested branches are counted for a function | `metrics.test.ts` · metrics count nested branches and ignore pure arithmetic |
| Schema records per-symbol health metrics | LOC matches line span | `metrics.test.ts` · LOC matches definition line span; file-owner nodes have no metrics row (`compass.test.ts` · file-owner nodes are hidden…) |
| Hotspots join activity and health on two axes | Default window is ninety days | `hotspots.test.ts` · sinceDaysAgo labels roughly 90 days |
| Hotspots join activity and health on two axes | High-churn unhealthy file ranks above quiet clean file | `hotspots.test.ts` · hotspots ranks high-churn complex file above quiet clean file |
| Hotspots join activity and health on two axes | Axes remain visible under combined sort | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Hotspots join activity and health on two axes | Shallow clone is announced | `git-history.shallow.test.ts` · a --depth=1 clone is flagged shallow |
| Temporal coupling with graph contrast | Co-changing files without an AST edge are flagged | `hotspots.test.ts` (unit) coupling cases |
| Temporal coupling with graph contrast | Member and builtin calls do not put a pair in the graph | `hotspots.test.ts` (integration) · coupling in_graph ignores member and builtin calls in its by-name fallback (red→green, Rework 3) |
| Temporal coupling with graph contrast | Giant commits do not invent coupling | `hotspots.test.ts` · coupling marks test pairs and excludes giant-only co-change |
| Temporal coupling with graph contrast | File and its test are marked isTestPair | `hotspots.test.ts` · coupling marks test pairs and excludes giant-only co-change |
| Temporal coupling with graph contrast | Weak single co-commit is filtered | `hotspots.test.ts` · weak single co-commit is filtered by default minShared |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | One explore call replaces impact and tests | manual: MCP `compass_explore compileHooks` (built server) returns callers, callees, blastRadius, affectedTests in one call; `mcp-surface.test.ts` |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Callees are resolved only | `compass.test.ts` · callees list only resolved symbols and count the unresolved (red→green); manual: 0 file-less callees for 5 bench symbols + compileHooks + accountingCharges |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Callback callers are listed | `compass.test.ts` · a function called only from a test callback lists that caller; manual: compileHooks callers include `(file) test/unit/hooks.test.ts`; accountingCharges callers include expense-distribution.spec.ts |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | File-owner nodes are hidden from find | `compass.test.ts` · file-owner nodes are hidden from find and name explore (extended in Rework 3: search/find/graphData/compact map); manual: mono `search` hits only functions; totals exclude 238 file nodes |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Find always runs hybrid with mode as weights only | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Diff context covers the working tree | `diff-context.test.ts` · diffContext resolves working-tree changes in a git repo |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Non-git diff without paths is refused | unchanged req (verbatim from canonical); regression: full `npm test` 869/869; `diff-context.test.ts` explicit-paths case |
| Consolidated Compass MCP surface req~compass-mcp-surface~1 | Visualize is CLI-only | `mcp-surface.test.ts` · full profile registers exactly nine canonical MCP tools; manual MCP tools/list |
| Directory hash tree | Unchanged repository short-circuits | `reindex.test.ts` · no-op reindex reports rootUnchanged and zero computed; manual: `root unchanged` after migration |
| Directory hash tree | A single changed file limits extraction | `compass.test.ts` · buildIndex is incremental |
| Directory hash tree | Emptying a directory changes the root | `merkle.test.ts`/`reindex.test.ts` · emptying a directory changes the root hash |
| Stat prefilter before content hash | Matching stat skips a read | `indexer-stat-prefilter.test.ts` · matching mtime+size skips reading bytes |
| Stat prefilter before content hash | Force bypasses the prefilter | `indexer-stat-prefilter.test.ts` · force bypasses the stat prefilter and re-hashes |
| Embedding cache keyed by embedder input | Renaming a file recomputes nothing | `embedding-cache.test.ts` · rename with identical content uses cache (computed 0) |
| Embedding cache keyed by embedder input | Moving code between files recomputes nothing | `embedding-cache.test.ts` · move symbol between files recomputes zero for that content hash |
| Embedding cache keyed by embedder input | Returning to a previous branch recomputes nothing | `embedding-cache.test.ts` · returning to prior content recomputes nothing |
| Embedding cache keyed by embedder input | Identical symbols embed once | `embedding-cache.test.ts` · identical embedder inputs share one cache row |
| Embedding cache keyed by embedder input | Recipe bump invalidates | `embedder.test.ts` · LexicalEmbedder id includes EMBED_INPUT_VERSION |
| Embedding cache lifecycle | Orphans pruned on request | `embedding-cache.test.ts` · prune deletes orphan cache rows past retention |
| Embedding cache lifecycle | Size limit evicts least recently seen | `embedding-cache.test.ts` · LRU eviction drops least-recently-seen when over size cap |
| Schema migration preserves embeddings | Existing vectors survive migration | `embedding-cache.test.ts` · migrate8to9 preserves embedding rows into cache; `db.test.ts` 9→10→11 keeps cache rows |
| Schema migration preserves embeddings | Failed migration rolls back | `embedding-cache.test.ts` · failed migrate8to9 rolls back; `db.test.ts` failed 10→11 rolls back |
| Per-file fragment independence | Reindexing A leaves B untouched | `fragments.test.ts` · reindexing file A leaves nodes and edges owned by B untouched (dst_node_id carve-out per amended text); `resolve-edges.test.ts` scoped-vs-full equivalence |
| Full-text index | Docstring text is searchable | `retrieval.test.ts` · docstrings indexed assertion |
| Full-text index | Subtokens make camelCase reachable from prose | `embedder.test.ts` · tokenize splits camelCase… |
| Full-text index | BM25 ordering is not inverted | `fts.test.ts` · FTS bm25 orders ASC |
| Full-text index | Missing FTS5 support degrades instead of failing | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Rank fusion | Fusion uses ranks only | `rank.test.ts` · rrfFuse uses ranks only with k=60 |
| Rank fusion | Exact name match is boosted | `rank.test.ts` · nameBoost prefers exact match |
| Rank fusion | Query shape routes the weights | `rank.test.ts` · routeWeights |
| Task-relative ranking | Focus changes the ordering | `pagerank.test.ts` · focus personalization changes order |
| Task-relative ranking | Focus defaults to the working state | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Task-relative ranking | Empty focus falls back to global importance | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Task-relative ranking | Generic names are penalized | `pagerank.test.ts` · isMeaningfulIdent requires length and camel/snake |
| Token budget | Output respects the budget | `budget-fit.test.ts`/`output-budget.test.ts` |
| Token budget | A single oversized result is truncated, not dropped | `budget-fit.test.ts` · fitToBudget never returns empty for non-empty hits |
| Hybrid retrieval quality gate | Golden set enforces MRR | `retrieval.test.ts` (green); performance.md: fixture hybrid MRR@10 1.000 main = branch; repo golden set 0.2755 → 0.3001 |
| No new runtime dependencies for hybrid retrieval | Default install has no downloads | unchanged req (verbatim from canonical); regression: full `npm test` 869/869; no dependency added (package.json unchanged) |
| No new runtime dependencies for hybrid retrieval | Lexical embedder remains default | `embedder.test.ts` · getEmbedder/setEmbedder |
| Explore resolves a file path req~explore-file-path~2 | Exact repo-relative path returns found true and a symbol from that file | `compass.test.ts` · explore resolves a repo-relative path or unique basename to a file symbol |
| Explore resolves a file path req~explore-file-path~2 | Symbol-name explore is unchanged | `compass.test.ts` · explore returns source, callees, and callers for an exact node |
| Explore resolves a file path req~explore-file-path~2 | A path that matches no file still may fuzzy-match names | `compass.test.ts` · explore falls back to fuzzy matches when no exact node exists |
| Explore resolves a file path req~explore-file-path~2 | File stem selects the matching symbol | `compass.test.ts` · explore resolves a repo-relative path… (stem case) |
| Explore resolves a file path req~explore-file-path~2 | Missing stem falls through to the first function | `compass.test.ts` · explore resolves a repo-relative path… (fallthrough case) |
| Explore resolves a file path req~explore-file-path~2 | Unique basename resolves to that file | `compass.test.ts` · explore resolves a repo-relative path or unique basename |
| Explore resolves a file path req~explore-file-path~2 | Ambiguous basename lists symbols from each file | `compass.test.ts` · same test, `dup.ts` ambiguous case |
| Explore resolves a file path req~explore-file-path~2 | Declaration-less file resolves to its file-owner node | `compass.test.ts` · path explore of a declaration-less file resolves to its file-owner node; manual: mono `explore apps/web/test/price.test.ts` → `file …:1-12` |
| Explore resolves a file path req~explore-file-path~2 | Symbol-less file without references resolves to its file-owner node | `compass.test.ts` · `src/blank.ts` expectation (found true, kind file); manual: mono `explore libs/core/src/index.ts` (barrel) → file node |
| Explore resolves a file path req~explore-file-path~2 | Search fallback matches file paths | unchanged req (verbatim from canonical); regression: full `npm test` 869/869 |
| Explore returns the exact symbol source req~explore-exact-source~1 | Multibyte text before the symbol does not shift the source | `compass.test.ts` · explore returns exact source after multibyte text; manual: Farmatodo `accountingCharges` source is a verbatim unique substring of the file |
| Explore returns the exact symbol source req~explore-exact-source~1 | A leading byte-order mark does not shift the source | `compass.test.ts` · BOM fixture in the exact-source test |
| No-op index fast path req~index-noop-fast-path~1 | A no-op run leaves the compact map untouched | `index-noop.test.ts` · a no-op run leaves dir_hashes, pagerank, edges, the embedding cache, and the map untouched |
| No-op index fast path req~index-noop-fast-path~1 | A no-op run skips global post-processing | `index-noop.test.ts` (same test) |
| No-op index fast path req~index-noop-fast-path~1 | An empty compact map block is refilled on a no-op run | `index-noop.test.ts` · an emptied map block is refilled on a no-op run |
| No-op index fast path req~index-noop-fast-path~1 | A changed file still runs the full pass | `index-noop.test.ts` · a changed file still runs the full pass and rewrites the map |
| No-op index fast path req~index-noop-fast-path~1 | Force, prune, and an explicit cache cap bypass the fast path | `index-noop.test.ts` · force and prune bypass…; an explicit cache cap bypasses… |
| No-op index fast path req~index-noop-fast-path~1 | The no-op index is not slower than main | performance.md: CLI medians 225.9 vs 223.7 ms (25 runs), pooled 101 runs 228.6 vs 226.6 ms, +1.9 ms, 95% CI [1, 3] → **not met by the letter** (+0.8%); in-process and cold-component timings equal (see performance.md) ⚠️ |
| Session-start index refresh req~session-start-index~1 | No index means nothing happens | `session-start.test.ts` · session-start without an index is silent and creates nothing |
| Session-start index refresh req~session-start-index~1 | An unchanged index refreshes silently | `session-start.test.ts` (unchanged req (verbatim from canonical); regression: full `npm test` 869/869) |
| Session-start index refresh req~session-start-index~1 | A changed file is picked up | `session-start.test.ts` · session-start picks up an edited function |
| Session-start index refresh req~session-start-index~1 | A locked database is swallowed | `session-start.test.ts` · session-start swallows a locked database |
| Session-start index refresh req~session-start-index~1 | The session-start run is not logged as a Compass call | `session-start.test.ts` · session-start is not logged as a Compass call |
| Session-start index refresh req~session-start-index~1 | Help lists the session-start command | `session-start.test.ts`/`help.test.ts` · help lists session-start |

## 5. Pre-existing / unrelated failures

- `law~compass-does-not-import-foundation~1` / `law~shared-stays-inner~1` report **unknown** (unresolved references). Pre-existing: main's binary on a populated index of the same tree gives the same 2 unknowns (28 / 36 refs); the branch improves 36 → 30.
- `integrity~advisory-mismatch~1` on `docs/compass.md` (warn): the lock digest matches neither HEAD nor the working copy; advisory-only, does not affect the exit code.
- Canonical `speclaw coverage` exit 1 (`req~explore-file-path~1`): expected until the delta is synced (task 18).
- `speclaw explore <node> --json` ignores `--json` (prints text) — same on main; out of scope (follow-up).
- MCP `compass_explore` `mode:"full"` is capped at the brief text budget (~6,000 chars) because `register.ts` wraps output with `text(…)` whose budget defaults to `brief`; output over budget is cut mid-JSON. Same on main (all default-mode explores of the 5 bench symbols are cut at 6,000 bytes on both builds); out of scope (follow-up).
- Callee `line` is the call-site line (in the explored symbol's file) paired with the callee's file — same on main; documentation follow-up.

**Not pre-existing (caused by this change):** the 12 `drift~changed-semantic` findings in `speclaw verify` (main: 0) — see the Verdict.

## 6. Pending manual steps

- Coordinator/human decision: re-seal the `cli` and `lawbook-workflow` drift anchors (`speclaw drift --reseal --capability cli` / `--capability lawbook-workflow`) after confirming those requirements still hold — proven on a throwaway copy to bring `verify` to exit 0, but it rewrites 2,629 lines of committed seal provenance, so the tester did not apply it.
- Coordinator/human decision on the no-op index criterion (+1.9 ms, +0.8% CLI wall-clock, see performance.md).
- Task 17 (human): `CLAUDE.md` / `AGENTS.md` schema 10 → 11 mentions + `speclaw laws accept` on a TTY.
- Task 18–19: sync, then archive.
- Note for operators: the session's old (2.0.9) MCP server wiped this repo's schema-11 index to 0 rows during the session (the documented downgrade ping-pong); `speclaw update` re-pins the MCP entry.

## 7. Verdict

**FAIL** — every functional check, regression test (red→green), and the task-12 gates (check, build, 869/869 tests, validate, change coverage 0 defects) pass, but two gate criteria are not met: `speclaw verify` exits 1 on a populated schema-11 index (12 `drift~changed-semantic` on `cli`/`lawbook-workflow` anchors, introduced by this change — remedy is a re-seal decision, not code) and the no-op index is +1.9 ms (+0.8%, 95% CI [1, 3] ms) slower than main at the CLI, against a strict "SHALL NOT exceed" scenario.
