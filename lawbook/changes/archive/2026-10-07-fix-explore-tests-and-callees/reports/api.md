# API checks — fix-explore-tests-and-callees (2026-10-06)

2026-10-06 · branch `fix/explore-tests-and-callees` · cwd `/Users/esneiderbravo/Projects/speclaw` (read-only index use) and throwaway copies under `/tmp/tester-fetc/` · built CLI `dist/cli/index.js` and the built MCP server (`node dist/cli/index.js mcp`) driven over stdio by an `@modelcontextprotocol/sdk` client. The session's own MCP server (old 2.0.9 build) was **not** used for Compass calls on this repo.

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

## 2. Tests added / updated, and the contract exercised

Transport: MCP stdio tools (no HTTP; there are no status codes — the equivalents are the MCP `isError` flag and the CLI exit code). Auth: none (local process, the caller's filesystem permissions). Ordering: stated per field below.

### `compass_explore` (MCP) / `speclaw explore <node>` (CLI text)

Input: `{ projectPath, node, to?, include?: ("source"|"callers"|"callees"|"blast_radius"|"tests"|"hotspot")[], mode?: "brief"|"full", maxDepth? }`.

| Field | Contract (this change) | Observed |
|---|---|---|
| `callees[]` | `{ name, file, line }`, **resolved edges only** (non-null `file`), de-duplicated by node; ordered by call line | `compileHooks`: `globError`, `hasBackend` only (main: 11 entries, 9 file-less) |
| `unresolvedCallees` | **new** `{ count: number, sample: string[] }` (≤10 distinct names, by frequency then name); kept whole by the output budget | `{"count":8,"sample":["some","push","find","map","unshift"]}` |
| `callers[]` | `{ name, kind, file, line }`; `kind: "file"` entries (named by repo path) for calls/imports with no enclosing definition; ordered by file path then line | `compileHooks`: `installHooks` + 7 × `(file) test/unit/hooks.test.ts` (main: `installHooks` only) |
| `affectedTests` | `{ count, files[], command: string \| null, commandReason: string, commands: {cwd, command, files[]}[] }` | see below |
| `isError` | `true` only for tool errors (no index, bad input) — unchanged | `false` on all calls |

### `speclaw affected-tests` (CLI, `--file a,b` comma-separated / `--from-diff <ref>` / `--json`), `compass_diff_context.affectedTests`, retired alias `compass_affected_tests` (delegates)

| Field | Contract |
|---|---|
| `mode` | `"static"` \| `"all"` (global file) |
| `tests[]` | `{ file, nodes, minDepth }`, sorted by path |
| `command` | `string \| null`; **never a run-nothing command**; `null` when nothing is selected; single group → `[cd <cwd> && ]<cmd>`; several groups → `(cd a && …) && (cd b && …)` runnable from the root |
| `commandReason` | always non-empty |
| `commands[]` | one entry per nearest-`package.json` group, `files` relative to `cwd`; `[]` when `command` is null |
| exit code | CLI 0 on success (including `command: null`); text mode prints `no command: <reason>` |

Cases exercised (all observed output):

| Case | Where | Result |
|---|---|---|
| none | this repo `--file README.md`; mono `--file README.md` | `{"mode":"static","tests":[],"command":null,"commandReason":"no test file is reachable from the change; nothing to run","commands":[]}`; text: `no command: no test file is reachable…`, exit 0 (main: `npm test -- --test-name-pattern=^$`) |
| subset, `node --test` compiled layout | this repo `--file src/modules/foundation/hooks.ts` | 20 files (incl. `test/unit/hooks.test.ts`; main: 9, without it); command `npm run pretest && node --test --test-concurrency=1 dist-test/test/…19 files…`; 1 helper (`test/helpers/fixtures.ts`) left out with reason; **executed: exit 0, `ℹ tests 263 · pass 263 · fail 0`, no coverage report; sum of per-file counts for the 19 files = 263** (exactly the selection ran) |
| all | this repo `--file package-lock.json` | `mode: "all"`, reason "global file matched (package-lock.json)", `command: "npm test"`, `commands: [{cwd:".",command:"npm test",files:[]}]` |
| vitest (+ `@/` alias, multi-line import, declaration-less test) | mono `apps/web/src/lib/price.ts` | `cd apps/web && npx vitest run test/price.test.ts` |
| Nx barrel (`@myorg/core` → `export * from "./lib/core"`) | mono `libs/core/src/lib/core.ts` | `cd apps/web && npx vitest run test/boot.test.ts` (main: `[]`) |
| jest | mono `packages/core/src/math.ts` | `cd packages/core && npx jest --runTestsByPath test/math.test.ts` |
| hoisted runner | mono `packages/hoisted/src/fmt.ts` | `cd packages/hoisted && npx vitest run src/fmt.test.ts`, reason "vitest inherited from the root package.json" |
| workspace (3 groups) | mono, 4 files | `(cd apps/web && npx vitest run test/boot.test.ts test/price.test.ts) && (cd packages/core && npx jest --runTestsByPath test/math.test.ts) && (cd packages/hoisted && npx vitest run src/fmt.test.ts)`; `commands` has 3 entries. vitest/jest are not installed offline, so the compound command was **executed from the root with a stub `npx`** that checks every test path exists in its cwd: all 4 `ok`, exit 0 |
| reference monorepo | copy of `ftd-admin-finanzas/apps/web` (+ root package.json) | `accountingCharges`: 13 affected tests incl. `apps/web/src/modules/quotes/domain/services/expense-distribution.spec.ts`, `cd apps/web && npx vitest run …`; callers include 16 call lines in that spec; callees 3 resolved + `unresolvedCallees.count 6`; source is a verbatim unique substring of the file (the declaration node, lines 541-600 without the parent `export `). main on the same copy: 0 tests, `npm test -- --test-name-pattern=^$`, 6/10 callees file-less |

### Isolation

No live data store is involved (local SQLite index files only). This repo's `.speclaw/index.db` was rebuilt by `speclaw index` (the agent's own derived index, regenerable); `docs/compass.md` was backed up first and its map block restored byte-equal to HEAD (non-map doc edits preserved). All other runs used throwaway copies under `/tmp/tester-fetc/` (repo copies, the `mono` fixture, the Farmatodo copy). The Farmatodo repo was only read (rsync source); no file there was written (its pre-existing modifications date from 18:34, before this session).


### Automated tests

Contract tests: `test/integration/affected-tests.test.ts` · CLI affected-tests reports the command contract in JSON and text; `test/unit/affected.test.ts` · mode none yields a null command with a reason, runner/workspace/compiled-glob/hoisted/flag-value cases; `test/integration/compass.test.ts` · callees list only resolved symbols and count the unresolved, callback caller (`kind: "file"`), file nodes hidden from find. All failed before the fix (backend.md §3) and pass now. `test/contract/registers.test.ts` and `test/integration/mcp-surface.test.ts` (nine canonical tools) green.

### Follow-ups observed on the contract (non-blocking)

- Callers list one `kind: "file"` row per call line: `buildIndex` has 121 caller rows from 10 files (full mode shows 40). Grouping file callers per file (`lines[]`) would keep production callers visible within the budget.
- MCP `mode:"full"` is re-capped at the brief text budget in `register.ts` (`text(…)` defaults to brief) and over-budget JSON is cut mid-document — pre-existing (main identical).

## 3. Spec-scenario coverage

Every `#### Scenario` of the delta spec (117); the contract rows are `req~affected-test-selection~1`, `req~compass-mcp-surface~1`, `req~explore-file-path~2`:

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

## 4. Pre-existing / unrelated failures

- `law~compass-does-not-import-foundation~1` / `law~shared-stays-inner~1` report **unknown** (unresolved references). Pre-existing: main's binary on a populated index of the same tree gives the same 2 unknowns (28 / 36 refs); the branch improves 36 → 30.
- `integrity~advisory-mismatch~1` on `docs/compass.md` (warn): the lock digest matches neither HEAD nor the working copy; advisory-only, does not affect the exit code.
- Canonical `speclaw coverage` exit 1 (`req~explore-file-path~1`): expected until the delta is synced (task 18).
- `speclaw explore <node> --json` ignores `--json` (prints text) — same on main; out of scope (follow-up).
- MCP `compass_explore` `mode:"full"` is capped at the brief text budget (~6,000 chars) because `register.ts` wraps output with `text(…)` whose budget defaults to `brief`; output over budget is cut mid-JSON. Same on main (all default-mode explores of the 5 bench symbols are cut at 6,000 bytes on both builds); out of scope (follow-up).
- Callee `line` is the call-site line (in the explored symbol's file) paired with the callee's file — same on main; documentation follow-up.

**Not pre-existing (caused by this change):** the 12 `drift~changed-semantic` findings in `speclaw verify` (main: 0) — see the Verdict.

## 5. Pending manual steps

- Coordinator/human decision: re-seal the `cli` and `lawbook-workflow` drift anchors (`speclaw drift --reseal --capability cli` / `--capability lawbook-workflow`) after confirming those requirements still hold — proven on a throwaway copy to bring `verify` to exit 0, but it rewrites 2,629 lines of committed seal provenance, so the tester did not apply it.
- Coordinator/human decision on the no-op index criterion (+1.9 ms, +0.8% CLI wall-clock, see performance.md).
- Task 17 (human): `CLAUDE.md` / `AGENTS.md` schema 10 → 11 mentions + `speclaw laws accept` on a TTY.
- Task 18–19: sync, then archive.
- Note for operators: the session's old (2.0.9) MCP server wiped this repo's schema-11 index to 0 rows during the session (the documented downgrade ping-pong); `speclaw update` re-pins the MCP entry.

## 6. Verdict

**FAIL** — every functional check, regression test (red→green), and the task-12 gates (check, build, 869/869 tests, validate, change coverage 0 defects) pass, but two gate criteria are not met: `speclaw verify` exits 1 on a populated schema-11 index (12 `drift~changed-semantic` on `cli`/`lawbook-workflow` anchors, introduced by this change — remedy is a re-seal decision, not code) and the no-op index is +1.9 ms (+0.8%, 95% CI [1, 3] ms) slower than main at the CLI, against a strict "SHALL NOT exceed" scenario.
