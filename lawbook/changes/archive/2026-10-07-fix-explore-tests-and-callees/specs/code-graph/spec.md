# Code graph

Reverse reachability (blast radius) over the Compass index, static selection of
test files affected by a change, and history×structure intelligence (hotspots
and temporal coupling). Level 1 impact is graph-only — no coverage
instrumentation. Correctness prefers node ids over names; agent output prefers
counts over raw dumps; global config files never report an empty radius.
Hotspots expose two raw axes (activity and health) rather than a single opaque
score; coupling reports facts (`strength`, `in_graph`, `isTestPair`) without
judgmental labels. Indexing is incremental: content-hash skip of unchanged
files, optional stat prefilter, a directory Merkle tree for no-op short-
circuit, and an embedding cache keyed by embedder-input hash so renames,
moves, and branch switches do not recompute vectors. Symbol discovery uses
**hybrid retrieval**: BM25 over names/subtokens/signatures/docs (FTS5 when
available), vector KNN, and exact-name matching fused with RRF, then ranked with
task-relative personalized PageRank and a token budget — always behind
`compass_find`. Every stored reference has an owning node: references outside
any definition are owned by a hidden per-file **file-owner node**, which every
file with no symbols and every re-export barrel also has.

### Requirement: Id-first reverse reachability `req~impact-id-first~1`

`compass_impact` / `speclaw query impact` SHALL compute the reverse dependency
closure of a target symbol (or of the symbols defined in a set of files) using
a single recursive SQL query. When `edges.dst_node_id` is non-NULL the join
SHALL use that id; when it is NULL the join MAY fall back to `edges.dst_name`,
except that an edge with `is_member` other than 0 SHALL NOT match by name. By default the
closure SHALL traverse edge kinds `call` and `import`. The caller MAY restrict
kinds. Every edge written by the indexer SHALL have a non-NULL `src_node_id`:
a call or import with no enclosing definition SHALL be owned by its file's
file-owner node (`kind = 'file'`, `name` = repo-relative path), which SHALL
appear in the closure with kind `file` when reached. A file with no symbol
nodes, or with an `export … from` re-export, SHALL also have a file-owner node. The indexer SHALL store
`is_member = 1` for a member call whose receiver is neither `this`/`super`
(Python `self`/`cls`) nor an import binding of the same file, and SHALL NOT
resolve such an edge by name. For a JS/TS member call whose receiver is an
import binding, the indexer SHALL store `is_member = 2` and the binding's import
specifier in `edges.spec`, and SHALL resolve that edge only when the same file's
import with that specifier resolved to a project file; an import that no
relative, `paths`, or `baseUrl` resolution maps to a project file is a package,
and member calls through its bindings SHALL stay unresolved. Such an edge whose
import resolved to a file that does not define the called name (a re-export
barrel) SHALL bind by name, preferring in order a definition under the import
target's directory, a definition in the calling file, and the lowest-id node. A call whose name
is a builtin global (at least `describe`, `it`, `test`, `expect`, `setTimeout`,
`require`) SHALL resolve only to a definition in the same file or, when the name
is an import binding of the file whose import resolved, in that import's target
file, and the by-name fallback of the closure
and of explore's callers SHALL match such a name only from an edge in the
definition's own file. Every returned node SHALL declare whether its
shortest path was fully id-resolved (`exact`) or used at least one name
fallback (`by-name`). Cycles SHALL terminate; each node SHALL appear once at
its minimum depth. A hard result limit SHALL set `truncated: true` when hit.

Needs: impl, utest

#### Scenario: Id-resolved edge is preferred over name match
- Given two distinct functions both named `validate` in different files
- And a caller whose edge to one of them has a non-NULL `dst_node_id`
- When `compass_impact` is invoked for that definition via `nodeId`
- Then the result SHALL contain the caller of that definition only
- And that caller's resolution SHALL be `exact`

#### Scenario: Name-resolved results are flagged
- Given an edge whose `dst_node_id` is NULL and whose `dst_name` matches the target
- When `compass_impact` is invoked for that symbol
- Then the caller SHALL appear with resolution `by-name`
- And the report's `by-name` count SHALL be greater than zero

#### Scenario: Import-only dependent is found
- Given module `b.ts` imports `a.ts` and never calls any of its symbols
- When `compass_impact` is invoked for a symbol defined in `a.ts` with default edge kinds
- Then a node from `b.ts` SHALL appear in the result

#### Scenario: Declaration-less importer is found
- Given `test/a.test.ts` declares no function, class, method, interface, type, or enum
- And it imports `src/a.ts` and calls `alpha` inside a `test(...)` callback
- When `compass_impact` is invoked for `alpha` defined in `src/a.ts`
- Then the file-owner node of `test/a.test.ts` SHALL appear with kind `file`

#### Scenario: Calls in callbacks have an owner
- Given an indexed project in which a call appears inside an arrow-function callback with no enclosing definition
- When the project is indexed under the current schema
- Then the count of edges whose `src_node_id` is NULL SHALL be 0

#### Scenario: Member calls on foreign receivers are not bound by name
- Given a project that defines a function named `push`
- And another file calls `items.push(x)` where `items` is a local array
- When the project is indexed and `compass_impact` is invoked for `push`
- Then that edge SHALL have `is_member` equal to 1 and `dst_node_id` NULL
- And the calling node SHALL NOT appear in the result

#### Scenario: Builtin globals bind only within the file
- Given a project file `src/runner.ts` that defines a function named `test`
- And a test file that calls the global `test(...)` without importing it
- When the project is indexed
- Then the test file's `test` call edge SHALL NOT resolve to the node in `src/runner.ts`
- And `compass_impact` and `compass_explore` for `test` SHALL NOT list the test file as a caller or dependent

#### Scenario: Package-namespace receivers are foreign
- Given a project that defines a function named `parse`
- And another file imports `path` from `"node:path"` and `_` from `"lodash"` and calls `path.parse(p)` and `_.parse(p)`
- When the project is indexed and `compass_explore` is invoked for `parse`
- Then those edges SHALL have `is_member` equal to 2 and `dst_node_id` NULL
- And the calling function SHALL NOT appear among the callers

#### Scenario: Scoped-looking paths aliases are project code
- Given `tsconfig.json` maps `"@app/*"` to `["src/app/*"]` and `"@myorg/core"` to `["libs/core/src/index.ts"]`
- And `src/main.ts` calls `svc.getUser()` through `import * as svc from "@app/services/user"` and `core.boot()` through `import core from "@myorg/core"`
- When the project is indexed
- Then `compass_explore` and `compass_impact` for `getUser` and for `boot` SHALL list the calling function

#### Scenario: Pure re-export barrels are project code
- Given `tsconfig.json` maps `"@myorg/core"` to `["libs/core/src/index.ts"]`, which contains only `export * from "./lib/core";`
- And `libs/core/src/lib/core.ts` defines `boot`
- And `apps/web/src/main.ts` calls `core.boot()` in `load` through `import * as core from "@myorg/core"`
- And `src/app.ts` calls `api.listUsers()` in `run` through `import * as api from "./api"`, where `src/api/index.ts` holds only re-exports and `src/api/users.ts` defines `listUsers`
- When the project is indexed
- Then each import edge SHALL resolve to the barrel's file-owner node
- And `compass_explore` and `compass_impact` for `boot` SHALL list `load`, and for `listUsers` SHALL list `run`

#### Scenario: A call through a barrel prefers the barrel's subtree
- Given `src/legacy/boot.ts` defines `boot` with a lower node id than `libs/core/src/lib/core.ts`'s `boot`
- And `src/main.ts` calls `core.boot()` and `boot()` through imports of the barrel `@myorg/core` (`libs/core/src/index.ts`)
- When the project is indexed
- Then both call edges SHALL resolve to the `boot` in `libs/core/src/lib/core.ts`

#### Scenario: Single-segment baseUrl modules are project code
- Given `tsconfig.json` sets `baseUrl` to `"src"` and `src/utils.ts` defines `fmt`
- And `src/view.ts` calls `utils.fmt()` through `import * as utils from "utils"`
- When the project is indexed
- Then `compass_explore` and `compass_impact` for `fmt` SHALL list the calling function

#### Scenario: An imported project function named like a builtin binds across files
- Given `src/http.ts` defines `fetch` and `src/client.ts` imports it from `"./http.js"` and calls `fetch("u")`
- And `src/global.ts` calls the global `fetch` without importing it
- When the project is indexed
- Then `compass_explore` and `compass_impact` for `fetch` SHALL list the caller in `src/client.ts`
- And SHALL NOT list the caller in `src/global.ts`

#### Scenario: Restricting edge kinds excludes imports
- Given the same project
- When `compass_impact` is invoked with edge kinds equal to `["call"]`
- Then no node from `b.ts` SHALL appear solely by virtue of the import

#### Scenario: A cyclic graph terminates
- Given functions forming a call cycle
- When `compass_impact` runs with a finite `maxDepth`
- Then each affected node SHALL appear exactly once with its shortest depth
- And the call SHALL return without hanging

### Requirement: Import resolution `req~import-resolution~1`

The indexer SHALL read each import statement's bindings and specifier from its
full text, SHALL store that text with runs of whitespace collapsed to one space
and capped at 1024 characters (a longer statement keeping its trailing `from`
clause), and SHALL resolve its specifier to a project file first as a relative path (including
`.js` → `.ts` mapping), then through the `compilerOptions.paths` and `baseUrl`
of the nearest `tsconfig.json` or `jsconfig.json` at or above the importing
file within the project root, following relative `extends` chains. IF a
tsconfig cannot be parsed, THEN the indexer SHALL skip alias resolution for
that file and SHALL NOT fail the index run. A resolved import edge SHALL point
`dst_node_id` at the target file's file-owner node when it exists, otherwise at
the target file's first node by `start_line`. Bare package specifiers that match
no project file SHALL remain unresolved.

Needs: impl, utest

#### Scenario: Multi-line import resolves
- Given `test/a.test.ts` imports `{ alpha, beta }` from `"../src/a.js"` across four lines
- When the project is indexed
- Then the import edge from `test/a.test.ts` SHALL have a non-NULL `dst_node_id` in `src/a.ts`

#### Scenario: An import longer than the cap still resolves
- Given `src/page.ts` imports more than 1024 characters of names, ending with `client`, from `"./gql/graphql.js"`
- And it calls `client.run()`
- When the project is indexed
- Then the stored import text SHALL be at most 1024 characters and end with the `from` clause
- And the import edge SHALL resolve into `src/gql/graphql.ts`
- And the `run` call edge SHALL have `is_member` equal to 2 (an import-bound receiver), not 1

#### Scenario: tsconfig paths alias resolves per workspace
- Given `apps/web/tsconfig.json` maps `"@/*"` to `["./src/*"]`
- And `apps/web/test/x.test.ts` imports `"@/lib/x"`
- When the project is indexed
- Then the import edge SHALL resolve to a node in `apps/web/src/lib/x.ts`

#### Scenario: Malformed tsconfig does not fail indexing
- Given a `tsconfig.json` that is not valid JSON with comments
- When the project is indexed
- Then indexing SHALL complete
- And relative imports in that directory SHALL still resolve

### Requirement: Grouped blast-radius output

`compass_impact` SHALL return per-module counts and a bounded number of
representative nodes by default, and MUST NOT return the full node list by
default. Totals SHALL always report the full counts. A `format: "flat"` option
SHALL return individual nodes up to the hard limit and set `truncated` when
needed. When a symbol name matches multiple definitions, the result SHALL list
those definitions and compute the union unless `nodeId` disambiguates.

#### Scenario: Large blast radius is summarised
- Given a change whose closure contains at least 200 nodes across at least 10 modules
- When `compass_impact` runs with default parameters
- Then `modules` SHALL contain at most 8 entries
- And each entry SHALL contain at most 5 nodes in its `top` list
- And `totals.nodes` SHALL report the full count

#### Scenario: Flat format is available on request
- Given the same change
- When `compass_impact` is invoked with `format` equal to `flat`
- Then the result SHALL contain individual nodes up to the hard limit
- And `truncated` SHALL report whether the limit was reached

#### Scenario: Ambiguous symbol name is announced
- Given the name `validate` resolves to three definitions
- When `compass_impact` is invoked with that name and no `nodeId`
- Then the result SHALL list the three definitions
- And the impact SHALL be the union of their reverse closures

### Requirement: Global files never report empty impact

Changes to files matching configured `globalFiles` globs (defaults SHALL
include TypeScript config patterns, package manifests, and common lockfiles)
SHALL be reported as a repository-wide blast radius with the matching patterns
and a human-readable reason. The system SHALL NOT report zero dependents for
such a change. Named targets (`build` | `test` | `lint` | `any`) SHALL filter
which changed paths participate, so a test-only change does not invalidate
`build`.

#### Scenario: Touching tsconfig is repo-wide
- Given `tsconfig.json` matches a default or configured global pattern
- When impact is invoked for files `["tsconfig.json"]`
- Then `blastRadius` SHALL be `repo`
- And `matched` SHALL name the pattern
- And the result SHALL NOT claim zero dependents without explanation

#### Scenario: Test-only change is empty for build target
- Given a change limited to `src/orders/service.test.ts`
- When impact is invoked with target `build`
- Then the affected set for build SHALL be empty
- And warnings SHALL state that the change only affects the `test` target

### Requirement: Schema records test and module metadata

Compass schema version SHALL be `"11"`. Opening a schema `"8"` database SHALL
migrate in place toward the current schema (embeddings preserved through the
8→9 path). Opening a schema `"9"` database SHALL migrate through `"10"`
(FTS and pagerank tables) to the current schema while reusing the embedding
cache when the embedder model id is unchanged. Opening other stale databases
SHALL recreate derived tables and force reindex. Every indexed file row SHALL
carry `is_test` (boolean derived from configured `testGlobs` at index time) and
`module` (stable path prefix / nearest package root heuristic). Query-time
`LIKE` over paths SHALL NOT be the primary test classifier.

#### Scenario: Schema 7 database is rebuilt on open
- Given an index stamped schema `"7"`
- When Compass opens the database under schema `"11"`
- Then derived tables SHALL be recreated
- And a needs-reindex marker SHALL be set

#### Scenario: Schema 9 migrates forward without wiping embeddings
- Given an index stamped schema `"9"` with a populated `embedding_cache`
- When Compass opens the database under schema `"11"`
- Then `node_text` / FTS / `pagerank` structures SHALL exist (or FTS omitted with soft degrade)
- And `edges.is_member` SHALL exist
- And `embedding_cache` rows SHALL remain
- And a reindex SHALL be required to populate `node_text`

#### Scenario: Test files are marked at index time
- Given `src/foo.ts` and `src/foo.test.ts` with default test globs
- When the project is indexed
- Then `foo.test.ts` SHALL have `is_test = 1` and `foo.ts` SHALL have `is_test = 0`

### Requirement: Schema 11 edge membership migration `req~schema-edge-membership~1`

WHEN Compass opens a database stamped schema `"10"`, it SHALL, inside a single
`BEGIN IMMEDIATE` transaction, add `edges.is_member INTEGER NOT NULL DEFAULT 0`
and `edges.spec TEXT`, set the needs-reindex marker with a reason that names schema 11, and stamp
schema `"11"`, and the next index run SHALL re-extract every file while
reusing `embedding_cache` rows whose key is unchanged. IF the migration fails,
THEN the transaction SHALL roll back and the stamp SHALL remain `"10"`. A
database stamped `"11"` whose `edges` lacks `spec` (a pre-release schema-11
index) SHALL take the same in-place step rather than being wiped.

Needs: impl, itest

#### Scenario: Schema 10 migrates to 11 and keeps embeddings
- Given an index stamped schema `"10"` with at least 10 `embedding_cache` rows
- When Compass opens the database under schema `"11"`
- Then `edges.is_member` and `edges.spec` SHALL exist
- And the stamp SHALL be `"11"` with the needs-reindex marker set
- And the `embedding_cache` row count SHALL be unchanged

#### Scenario: A schema-11 index without edges.spec migrates in place
- Given an index stamped schema `"11"` whose `edges` has `is_member` but no `spec`, with `embedding_cache` rows
- When Compass opens the database
- Then `edges.spec` SHALL exist and the needs-reindex marker SHALL be set
- And the `embedding_cache` row count SHALL be unchanged

#### Scenario: Reindex after migration recomputes no unchanged embedding
- Given the migrated index and no source changes
- When `compass_index` runs
- Then every file SHALL be re-extracted
- And embeddings computed SHALL be 0

#### Scenario: Failed 10 to 11 migration rolls back
- Given a migration that fails partway through
- When the index is inspected afterwards
- Then the recorded schema version SHALL remain `"10"`

### Requirement: Static affected-test selection `req~affected-test-selection~1`

`compass_affected_tests` / `speclaw query affected-tests` SHALL return a
superset of the test files that could be affected by a change (files and/or
symbols and/or `--from-diff`), using reverse reachability into `is_test = 1`
files, and SHALL return `command` (string or `null`), `commandReason` (always a
non-empty string), and `commands` (a list of `{ cwd, command, files }`, empty
when `command` is `null`). The system SHALL NOT emit a command that runs no
test. WHEN no test file is selected, `command` SHALL be `null` and
`commandReason` SHALL state that no test is reachable. WHEN test files are
selected, the system SHALL group them by the nearest `package.json` directory
and SHALL build each group's command from that package's detected runner; a
package with no `scripts.test` and no vitest or jest dependency SHALL inherit
the runner of the nearest ancestor `package.json` within the root that declares
vitest or jest. The commands are `npx vitest run <files>` for vitest,
`npx jest --runTestsByPath <files>` for jest, and for a `node --test` script the
script's `node` flags (each with its value) without coverage flags (or their
values) followed by the selected files, a directory argument matching every
file under it (mapped onto the script's compiled-test
glob when the sources do not match it, prefixed by `npm run pretest` when that
script exists, and leaving out selected files whose name no glob can match,
since the script never runs them); an unrecognized runner SHALL receive the files as arguments to
`npm test --`. WHEN more than one group is selected, `command` SHALL run every
group from the repository root. The default `test` target filter SHALL admit
source and test paths inside workspace packages (`**/src/**`, `**/test/**`,
`**/tests/**`), not only at the repository root. Global-file matches SHALL select
the full suite (`mode: "all"`) with reason. Present-but-unindexed language
extensions SHALL produce warnings. Precise coverage narrowing is OUT OF SCOPE for this
capability revision.

Needs: impl, utest, itest

#### Scenario: Only reachable tests are selected
- Given a project with 20 test files of which 2 transitively depend on the changed file
- When `compass_affected_tests` is invoked with that changed file
- Then exactly those 2 test files SHALL be returned
- And `skipped.files` SHALL be 18
- And `command` SHALL include both selected paths

#### Scenario: Nothing selected yields no command
- Given a change that no test file reaches
- When `compass_affected_tests` runs
- Then `tests` SHALL be empty
- And `command` SHALL be `null`
- And `commandReason` SHALL state that no test file is reachable
- And `commands` SHALL be empty

#### Scenario: Vitest package gets a non-watch command
- Given `apps/web/package.json` whose `scripts.test` is `vitest`
- And a selected test file `apps/web/test/x.test.ts`
- When `compass_affected_tests` runs
- Then `commands` SHALL contain an entry with `cwd` equal to `apps/web` and a command starting with `npx vitest run`

#### Scenario: Compiled node test layout is mapped
- Given `scripts.test` equal to `node --test --experimental-test-coverage 'dist-test/test/**/*.test.js'` and a `pretest` script
- And a selected test file `test/unit/a.test.ts`
- When `compass_affected_tests` runs
- Then `command` SHALL start with `npm run pretest &&`
- And `command` SHALL contain `dist-test/test/unit/a.test.js`
- And `command` SHALL NOT contain `--experimental-test-coverage`

#### Scenario: Hoisted runner is inherited
- Given a root `package.json` declaring `vitest` and `packages/x/package.json` with no `scripts.test` and no runner dependency
- And a selected test file `packages/x/src/a.test.ts`
- When `compass_affected_tests` runs
- Then `command` SHALL be `cd packages/x && npx vitest run src/a.test.ts`

#### Scenario: Node test flag values stay with their flags
- Given `scripts.test` equal to `node --import ./register.mjs --test --test-coverage-lines 80 'test/**/*.test.ts'`
- And a selected test file `test/unit/a.test.ts`
- When `compass_affected_tests` runs
- Then `command` SHALL be `node --import ./register.mjs --test test/unit/a.test.ts`

#### Scenario: Directory argument selects the files under it
- Given `scripts.test` equal to `node --test test/`
- And a selected test file `test/unit/a.test.ts`
- When `compass_affected_tests` runs
- Then `command` SHALL be `node --test test/unit/a.test.ts`

#### Scenario: Workspace-spanning selection lists every group
- Given selected test files under `apps/web` (vitest) and `packages/core` (jest)
- When `compass_affected_tests` runs
- Then `commands` SHALL contain one entry for each of the two directories
- And `command` SHALL contain both groups' commands

#### Scenario: Global file selects the full suite
- Given a change that includes `package-lock.json`
- When `compass_affected_tests` runs
- Then `mode` SHALL be `all`
- And `reason` SHALL mention the global match
- And `command` SHALL invoke the project's full test script

#### Scenario: Unindexed language degrades loudly
- Given the repository contains `.go` files and the index covers only TS/JS/Python
- When `compass_affected_tests` is invoked
- Then `warnings` SHALL state that `.go` files are not indexed

#### Scenario: Diff mode uses git changed files
- Given a git repository with a merge-base against `main`
- When `speclaw query affected-tests --from-diff main` runs
- Then the seed file set SHALL equal `changedFiles(project, "main")`
- And selection SHALL proceed as for an explicit file list

### Requirement: Optional affected configuration

When `.speclaw/affected.json` is present, speclaw SHALL load and validate it
(versioned document) to override `globalFiles`, `testGlobs`, `targets`, and
`ignore`. When absent, embedded defaults SHALL apply. Invalid documents SHALL
fail at load with a clear error, not at query time mid-flight.

#### Scenario: Missing config uses defaults
- Given no `.speclaw/affected.json`
- When impact or affected-tests runs
- Then the embedded default global and test globs SHALL apply

### Requirement: Schema records per-symbol health metrics

Under the current schema, every indexed definition node SHALL have a
`node_metrics` row with at least `loc` (`end_line - start_line + 1`),
`max_nesting` (maximum nesting depth of configured block types inside the
definition), and `branches` (decision-point count using language-specific
tree-sitter node types; boolean `&&`/`||` count, arithmetic operators do not).
File-owner nodes are not definitions and SHALL NOT have a `node_metrics` row.
Metrics SHALL be computed during extract/index, not by scanning source at query
time.

#### Scenario: Nested branches are counted for a function
- Given a TypeScript function whose body contains nested `if` statements and a
  logical `&&` expression
- When the project is indexed
- Then that function's `node_metrics.branches` SHALL be greater than zero
- And `max_nesting` SHALL reflect the deepest nesting of configured block types
- And a pure arithmetic expression SHALL NOT inflate `branches`

#### Scenario: LOC matches line span
- Given a definition spanning lines 10 through 19
- When the project is indexed
- Then that definition's `node_metrics.loc` SHALL equal 10

### Requirement: Hotspots join activity and health on two axes

`compass_hotspots` / `speclaw hotspots` SHALL return files ranked for agent
attention using (a) git activity over a window whose default SHALL be the last
90 days and (b) AST health from `node_metrics` for symbols in indexed files.
Each hotspot SHALL expose **both** axes as separate fields (activity and
health). A `sortBy` of `churn`, `complexity`, or `combined` SHALL be accepted;
`combined` MAY use a documented heuristic but SHALL NOT hide the raw axes.
Unindexed files MAY appear with `health: null`. Results SHALL include
diagnostics (window label, commits scanned / skipped-too-large when available)
and SHALL warn when the repo is a shallow clone. Tool and CLI descriptions
SHALL NOT claim a single customer case study as general proof; relative churn
as a defect signal MAY be described as published research, not as a guarantee.

#### Scenario: Default window is ninety days
- Given a git repository with an index
- When `compass_hotspots` is invoked with no `since` override
- Then the result's window label or bounds SHALL correspond to approximately
  the last 90 days

#### Scenario: High-churn unhealthy file ranks above quiet clean file
- Given file `hot.ts` with many recent commits and a symbol with high `branches`
- And file `cold.ts` with few commits and low complexity
- When `compass_hotspots` is invoked with `sortBy` equal to `combined`
- Then `hot.ts` SHALL appear before `cold.ts` in the ordered list

#### Scenario: Axes remain visible under combined sort
- Given any non-empty hotspots result sorted by `combined`
- When the agent inspects a hotspot entry
- Then that entry SHALL include separate activity fields (at least commits)
  and health fields when the file is indexed (at least worstBranches or loc)

#### Scenario: Shallow clone is announced
- Given a shallow clone
- When `compass_hotspots` runs
- Then `warnings` SHALL mention that history may be truncated

### Requirement: Temporal coupling with graph contrast

`compass_coupling` / `speclaw coupling` SHALL, for a target file, return other
files that co-changed with it in the same default 90-day window (overridable),
with at least: co-occurrence count (`both`), per-file commit counts, Jaccard-style
`strength` = `both / (commits(A) + commits(B) - both)`, whether any Compass
call/import edge links the two files (`in_graph`), and whether the pair is a
source↔test pair by `files.is_test` (`isTestPair`). An unresolved edge SHALL
count toward `in_graph` by name only under the by-name rule of
`req~impact-id-first~1`: `is_member` equal to 0 and a name that is not a builtin
global. Commits that touch more than
a configurable `maxFilesPerCommit` (default SHALL be 50) SHALL be excluded from
coupling math, and diagnostics SHALL report how many such commits were skipped.
Pairs below `minShared` (default SHALL be at least 2) SHALL be omitted.
The tool SHALL NOT emit verdict labels such as “bad architecture” or “healthy”;
facts only. Descriptions SHALL stay honest about what temporal coupling can and
cannot prove.

#### Scenario: Co-changing files without an AST edge are flagged
- Given `schema.sql` and `migration.sql` co-commit at least twice and share no
  call/import edge in the index
- When `compass_coupling` is invoked for `schema.sql`
- Then `migration.sql` SHALL appear with `in_graph` equal to false
- And `strength` SHALL be greater than zero

#### Scenario: Member and builtin calls do not put a pair in the graph
- Given `src/parser.ts` defines `parse` and `test`, and `src/use.ts` calls only `path.parse(p)` (from `"node:path"`), `items.parse(p)`, and the global `test(...)`
- And the two files co-commit at least twice
- When `compass_coupling` is invoked for `src/parser.ts`
- Then `src/use.ts` SHALL appear with `in_graph` equal to false

#### Scenario: Giant commits do not invent coupling
- Given a single commit that touches more than 50 files including `a.ts` and `b.ts`
- And no other co-commits of that pair
- When `compass_coupling` runs for `a.ts` with default `maxFilesPerCommit`
- Then `b.ts` SHALL NOT appear solely because of that giant commit
- And diagnostics SHALL show at least one skipped-too-large commit

#### Scenario: File and its test are marked isTestPair
- Given `src/foo.ts` (`is_test = 0`) and `src/foo.test.ts` (`is_test = 1`) that
  co-change enough times to pass `minShared`
- When `compass_coupling` is invoked for `src/foo.ts`
- Then the entry for `src/foo.test.ts` SHALL have `isTestPair` equal to true

#### Scenario: Weak single co-commit is filtered
- Given two files that share exactly one non-giant commit
- When `compass_coupling` runs with default `minShared`
- Then that pair SHALL be absent from the result

### Requirement: Consolidated Compass MCP surface `req~compass-mcp-surface~1`

The Compass MCP module SHALL expose **`compass_explore`**, **`compass_find`**,
**`compass_diff_context`**, and **`compass_index`** as canonical tools.
`compass_explore` SHALL return symbol source, callers, callees, aggregated blast
radius, affected tests, and hotspot standing in one response when requested via
default includes. `compass_explore` SHALL list in `callees` only references
resolved to an indexed node, de-duplicated by node id, and SHALL report the
remaining references as `unresolvedCallees` with a `count` and a `sample` of at
most 10 distinct names. `compass_explore` SHALL list callers owned by a
file-owner node as entries of kind `file`. `compass_find` and name-based
explore lookups SHALL NOT return file-owner nodes, and file-owner nodes SHALL
have no `pagerank`, `node_text`, embedding, or `node_metrics` row and SHALL NOT
count toward `totals.nodes`. `compass_find` SHALL run the **hybrid retrieval**
pipeline for every call; `mode: exact | concept` SHALL only adjust fusion
weights (sparse-heavy vs dense-heavy), not select a single stage.
`compass_diff_context` SHALL return changed symbols, aggregated blast radius,
affected tests (with the `command`, `commandReason`, and `commands` contract of
`req~affected-test-selection~1`), and hotspots for a git revision or working
tree in one call. Retired names (`compass_search`, `compass_recall`,
`compass_impact`, `compass_trace`, `compass_affected_tests`,
`compass_hotspots`, `compass_coupling`, `compass_watch`) SHALL delegate through
deprecation aliases for two minor versions.

Needs: impl, itest

#### Scenario: One explore call replaces impact and tests
- Given an indexed project containing symbol `renderInit`
- When `compass_explore` is invoked for `renderInit` with default includes
- Then the response SHALL contain blast-radius summary and affected-test count
- And no further tool call SHALL be required for those signals

#### Scenario: Callees are resolved only
- Given a function that calls a project function `helper` and also calls `items.push(x)` and `console.log(x)`
- When `compass_explore` is invoked for that function
- Then `callees` SHALL contain `helper` with its file
- And `callees` SHALL NOT contain an entry without a file
- And `unresolvedCallees.count` SHALL be at least 2

#### Scenario: Callback callers are listed
- Given a function `alpha` called only inside a `test(...)` callback of `test/a.test.ts`
- When `compass_explore` is invoked for `alpha`
- Then `callers` SHALL contain an entry of kind `file` for `test/a.test.ts`
- And the affected-test count SHALL be at least 1

#### Scenario: File-owner nodes are hidden from find
- Given an indexed file `test/a.test.ts` whose file-owner node exists
- When `compass_find` is invoked with the query `a.test`
- Then no hit SHALL have kind `file`

#### Scenario: Find always runs hybrid with mode as weights only
- Given an indexed project with FTS and embeddings available
- When `compass_find` is invoked with `mode: exact` and a single-identifier query
- Then the result SHALL be produced by the hybrid pipeline
- And sparse/name list weights SHALL be at least as high as the vector list weight
- When `compass_find` is invoked with `mode: concept` and a multi-word prose query
- Then the result SHALL be produced by the hybrid pipeline
- And the vector list weight SHALL be greater than the full-text list weight

#### Scenario: Diff context covers the working tree
- Given a git repository with uncommitted changes in tracked source files
- When `compass_diff_context` is invoked with no revision and no explicit paths
- Then the response SHALL list changed symbols and an aggregated blast radius

#### Scenario: Non-git diff without paths is refused
- Given a directory that is not a git repository
- When `compass_diff_context` is invoked with no explicit paths
- Then the call SHALL return an actionable error
- And it SHALL NOT return an empty successful result

#### Scenario: Visualize is CLI-only
- Given the MCP server in full profile
- When the tool list is requested
- Then `compass_visualize` SHALL NOT appear as a canonical or alias registration

### Requirement: Directory hash tree

The indexer SHALL maintain a hash for every indexed directory, computed from the
sorted child names and hashes (byte order, NUL-separated), and SHALL report when
the project-root hash is unchanged after a walk that reuses stored file hashes
(via the stat prefilter and/or content-hash equality). The Merkle tree SHALL
enumerate exactly the same file set as the indexer (same skip dirs / globs).
Empty directories SHALL hash to a stable empty sentinel and remain recorded.
Per-directory early-exit during the walk (skipping an entire subtree without
statting its children) is OPTIONAL; correctness is defined by matching hashes
and by not re-extracting unchanged files.

#### Scenario: Unchanged repository short-circuits
- Given a fully indexed project with no filesystem changes since the last index
- When `compass_index` / `speclaw index` runs
- Then the result SHALL report that the root hash was unchanged
- And no node, edge, or embedding write SHALL occur for that run's content phase

#### Scenario: A single changed file limits extraction
- Given a fully indexed project of at least 100 files in at least 10 directories
- And exactly one indexed file has been modified
- When `compass_index` runs
- Then only that file SHALL be re-extracted
- And ancestor directory hashes of that file SHALL update
- And unrelated directory hashes SHALL remain unchanged (same hash values)

#### Scenario: Emptying a directory changes the root
- Given an indexed directory containing exactly one indexed file
- When that file is deleted and `compass_index` runs
- Then the root hash SHALL differ from the previously stored root hash

### Requirement: Stat prefilter before content hash

`files` SHALL persist `mtime_ms` and `size`. When both match the on-disk `stat`,
the indexer SHALL reuse the stored content hash without reading file bytes.
Content hash remains the source of truth when a file is read. A force flag SHALL
bypass the prefilter.

#### Scenario: Matching stat skips a read
- Given an indexed file whose `mtime_ms` and `size` still match `stat`
- When `compass_index` runs without force
- Then the indexer SHALL NOT read that file's bytes to decide unchanged
- And the file SHALL count toward skipped-by-stat statistics

#### Scenario: Force bypasses the prefilter
- Given the same file
- When `compass_index` runs with force enabled
- Then the file content SHALL be read and re-hashed

### Requirement: Embedding cache keyed by embedder input

Embeddings SHALL be stored in `embedding_cache` keyed by
`(content_hash, model)`, where `content_hash` is the hash of the **embedder
input recipe** (including `EMBED_INPUT_VERSION`, language, kind, name,
signature, and embed text) — not the file path and not solely `body_hash`.
Deleting a node MUST NOT delete its cache row. `node_embeddings` SHALL be a
view joining `nodes` to `embedding_cache` with columns `node_id`, `dim`,
`model`, `vec` so `recall` keeps working. Identical pending hashes SHALL embed
once per run. Index output SHALL report `computed` and `fromCache` separately.

#### Scenario: Renaming a file recomputes nothing
- Given an indexed file whose symbols all have cached embeddings
- When the file is renamed with content unchanged and `compass_index` runs
- Then embeddings computed SHALL be 0
- And every symbol in the renamed file SHALL still resolve to an embedding

#### Scenario: Moving code between files recomputes nothing
- Given a symbol body and signature moved verbatim to another file
- When `compass_index` runs
- Then embeddings computed for that symbol SHALL be 0

#### Scenario: Returning to a previous branch recomputes nothing
- Given a project indexed on branch A, then modified and indexed on branch B
- When branch A is checked out again and `compass_index` runs
- Then embeddings computed SHALL be 0
- And the result SHALL report reused embeddings as served from cache

#### Scenario: Identical symbols embed once
- Given two files with byte-identical embedder inputs for a symbol
- When the project is indexed from scratch
- Then exactly one embedding SHALL be computed for that content hash
- And both nodes SHALL resolve to it via the view

#### Scenario: Recipe bump invalidates
- Given cached embeddings under recipe version N
- When `EMBED_INPUT_VERSION` is bumped and `compass_index` runs
- Then embeddings for active nodes SHALL be recomputed under the new model id
- And stale `model` rows SHALL NOT appear in `recall` results

### Requirement: Embedding cache lifecycle

The index SHALL bound cache size with automatic LRU eviction by `last_seen_at`
when over a configured max (default 256 MB), and SHALL support an explicit
prune that deletes orphans older than a retention window (default 30 days)
that no live `nodes.content_hash` references.

#### Scenario: Orphans pruned on request
- Given cache rows referenced by no node and older than the retention window
- When `compass_index` runs with prune enabled
- Then those rows SHALL be deleted
- And rows still referenced by a node SHALL be retained

#### Scenario: Size limit evicts least recently seen
- Given a cache exceeding the configured size limit
- When `compass_index` completes
- Then rows SHALL be deleted in ascending `last_seen_at` until under the limit

### Requirement: Schema migration preserves embeddings

Opening an index at schema 8 SHALL migrate to schema 9 inside a single
`BEGIN IMMEDIATE` transaction: create `embedding_cache` and `dir_hashes`, add
`files.mtime_ms`/`size` and `nodes.content_hash`, backfill content hashes,
copy existing vectors into the cache, replace `node_embeddings` with the view,
and stamp schema 9. Failure SHALL roll back and leave schema 8 unchanged.

#### Scenario: Existing vectors survive migration
- Given an index at schema 8 with embeddings for at least 50 nodes
- When the index is opened by schema 9 code
- Then `embedding_cache` SHALL contain at least 50 rows
- And `recall` SHALL return results without requiring a full re-embed

#### Scenario: Failed migration rolls back
- Given a migration that fails partway through
- When the index is inspected afterwards
- Then the recorded schema version SHALL remain 8
- And the failure message SHALL name the recovery action

### Requirement: Per-file fragment independence

Re-indexing one file SHALL NOT modify `nodes` or `edges` rows owned by any
other file. Edges SHALL continue to resolve lazily (`dst_node_id` nullable).

`edges.dst_node_id` is a resolution cache, outside this guarantee: when file A
is re-extracted, an edge owned by another file B whose `dst_node_id` pointed at
one of A's old nodes SHALL be reset to NULL and MAY be re-resolved to A's new
node. No other column of B's edges, and none of B's `nodes` rows, SHALL change.

#### Scenario: Reindexing A leaves B untouched
- Given an indexed project where file A's symbols are called from file B
- When file A is modified and re-indexed
- Then no `nodes` or `edges` row whose owning file is B SHALL be inserted
  or deleted, and no column of B's rows other than `edges.dst_node_id` SHALL be
  updated

### Requirement: Full-text index

Compass SHALL maintain a full-text index over symbol names, name subtokens,
signatures, and docstrings, and SHALL rank full-text candidates with BM25 when
FTS5 is available. Docstrings SHALL be extracted at index time (TypeScript/JavaScript:
block comment immediately preceding the node; Python: first string literal in the
body). Full function bodies SHALL NOT be indexed into FTS in this revision.

#### Scenario: Docstring text is searchable
- Given an indexed function whose docstring contains the word `idempotent` and whose name does not
- When `compass_find` is called with the query `idempotent`
- Then that function SHALL appear in the results

#### Scenario: Subtokens make camelCase reachable from prose
- Given an indexed symbol named `getUserById`
- When `compass_find` is called with the query `user by id`
- Then that symbol SHALL appear in the results

#### Scenario: BM25 ordering is not inverted
- Given two indexed symbols, one whose name matches the query exactly and one that matches only in its docstring
- When the full-text stage runs
- Then the exact name match SHALL have the better full-text rank

#### Scenario: Missing FTS5 support degrades instead of failing
- Given a runtime whose SQLite build has no FTS5 support
- When `compass_index` and `compass_find` run
- Then neither command SHALL throw
- And the search result SHALL report a degraded full-text stage

### Requirement: Rank fusion

Compass SHALL fuse the full-text, vector, and exact-name candidate lists with
Reciprocal Rank Fusion using `k = 60`, and SHALL NOT combine raw relevance
scores arithmetically. Exact and prefix name matches SHALL receive an explicit
boost after fusion. Query shape SHALL route list weights (identifier →
sparse/name-heavy; multi-word prose → dense-heavy).

#### Scenario: Fusion uses ranks only
- Given a full-text candidate with an unbounded negative BM25 score and a vector candidate with a cosine score in [-1, 1]
- When fusion runs
- Then each candidate's contribution SHALL be computed from its rank in its own list
- And the raw scores SHALL NOT appear in the fused score

#### Scenario: Exact name match is boosted
- Given a query that exactly equals an indexed symbol name
- And another candidate that ranks first in both the full-text and vector lists
- When fusion and boosting run
- Then the exact name match SHALL rank first

#### Scenario: Query shape routes the weights
- Given a single-identifier query
- When routing runs
- Then the full-text list weight SHALL be greater than or equal to the vector list weight
- And for a multi-word prose query the vector list weight SHALL be greater than the full-text weight

### Requirement: Task-relative ranking

Compass SHALL rank results using personalized PageRank over a bipartite
file–symbol graph, personalized on the caller-supplied focus set. When `focus`
is omitted in a git repository, the working-tree changed paths SHALL be used.
Empty focus SHALL fall back to uniform (global) personalization. Generic names
defined in more than five files SHALL be down-weighted. Structural rerank MAY
use graph hops to focus, churn, and definition kind; directory path-distance
SHALL NOT be used as a ranking signal.

#### Scenario: Focus changes the ordering
- Given two symbols with identical fused seed scores, one referenced from a file in the focus set and one not
- When ranking runs
- Then the symbol referenced from the focus set SHALL rank higher

#### Scenario: Focus defaults to the working state
- Given a git repository with uncommitted changes and no explicit `focus` argument
- When `compass_find` runs
- Then the changed file paths SHALL be used as the focus set
- And the result SHALL report the focus set that was used

#### Scenario: Empty focus falls back to global importance
- Given a project that is not a git repository and no explicit `focus`
- When ranking runs
- Then the personalization vector SHALL be uniform
- And ranking SHALL still complete successfully

#### Scenario: Generic names are penalized
- Given a symbol name defined in more than five files
- When edge weights are computed
- Then that name's edge weight SHALL be reduced relative to an otherwise identical name defined once

### Requirement: Token budget

Compass SHALL fit rendered search output to a caller-supplied token budget by
binary search with a 15% tolerance, and SHALL report the actual token count.
Rendered context SHALL use TreeContext elision markers. A single oversized
result SHALL be truncated, not dropped.

#### Scenario: Output respects the budget
- Given a query matching many symbols and a budget of 2000 tokens
- When `compass_find` runs with that budget
- Then the reported token count SHALL be within 15% of 2000 or below it
- And the rendered output SHALL contain elision markers when content is omitted

#### Scenario: A single oversized result is truncated, not dropped
- Given a budget smaller than the rendering of the single best result
- When `compass_find` runs
- Then the result SHALL contain that symbol in truncated form
- And the result SHALL NOT be empty

### Requirement: Hybrid retrieval quality gate

The test suite SHALL include a golden set of at least 40 `(query, expected symbol)`
pairs over a fixture repository and SHALL fail when MRR@10 falls below the
configured threshold relative to the documented LIKE baseline. A latency budget
for hybrid find on a fixed fixture SHALL be enforced in CI.

#### Scenario: Golden set enforces MRR
- Given the retrieval golden set fixture
- When the hybrid pipeline is evaluated
- Then MRR@10 SHALL meet or exceed the configured threshold
- And the suite SHALL record the LIKE baseline for comparison

### Requirement: No new runtime dependencies for hybrid retrieval

Compass SHALL implement hybrid retrieval without adding native modules,
downloaded models, or SQLite extensions as hard requirements. The default
embedder SHALL remain the lexical offline embedder. Optional richer embedders
are OUT OF SCOPE for this revision.

#### Scenario: Default install has no downloads
- Given a fresh installation with the default embedder
- When `compass_index` and `compass_find` run
- Then no network request SHALL be required for retrieval
- And no SQLite extension SHALL be loaded as a hard dependency

#### Scenario: Lexical embedder remains default
- Given a project that has not requested an alternative embedder
- When indexing runs
- Then the lexical embedder SHALL be used
- And its id SHALL be recorded in the embedding cache model field

### Requirement: Explore resolves a file path `req~explore-file-path~2`

WHEN an explore or search query misses an exact symbol-name match, Compass SHALL resolve a normalized file path against `files.path` (trim; strip a leading `./`; turn backslashes into slashes; make an absolute path that starts with the project root repo-relative), preferring an exact path match, otherwise a unique suffix match when the query contains a slash (the path equals the query or ends with `/` plus the query), otherwise a unique basename match, and on exactly one file that has visible symbols (any node other than its file-owner node) return `found: true` with a deterministic primary symbol (the name equals the file stem, preferring a function over a class; otherwise the first function by `start_line`; otherwise the first visible symbol), that symbol's source, callers, and callees as a name hit, `otherMatches` for the other visible symbols in the file, and a message that the path resolved to that symbol; on exactly one file whose only node is its file-owner node return `found: true` with that file-owner node (kind `file`) as primary, with its callees and affected tests; an ambiguous basename or an indexed file with no node keeps `found` false with a message that says so, and does not claim zero similar symbols when sibling symbols exist; the search fallback also matches `files.path` with LIKE metacharacters `%` and `_` escaped and keeps name-substring matching; and this resolution adds no dependency and creates no node of its own.

Needs: impl, itest

#### Scenario: Exact repo-relative path returns found true and a symbol from that file
- Given an indexed file `src/main.ts` that defines symbols and no symbol named `src/main.ts`
- When explore is invoked with the repo-relative path `src/main.ts`
- Then `found` SHALL be true
- And the primary symbol SHALL be a symbol defined in `src/main.ts`
- And `otherMatches` SHALL include the other symbols defined in that file
- And the message SHALL state that the path resolved to the primary symbol

#### Scenario: Symbol-name explore is unchanged
- Given an indexed symbol named `alpha`
- When explore is invoked with `alpha`
- Then `found` SHALL be true
- And the primary symbol SHALL be `alpha`
- And the source, callers, and callees SHALL be those of the exact-name hit on `alpha`

#### Scenario: A path that matches no file still may fuzzy-match names
- Given an indexed symbol named `alpha` and no indexed file whose path matches `alph`
- When explore is invoked with `alph`
- Then the call SHALL NOT throw
- And `found` SHALL be false
- And `otherMatches` SHALL include `alpha`

#### Scenario: File stem selects the matching symbol
- Given exactly one indexed file whose stem equals a function defined in that file
- When explore is invoked with that file's repo-relative path
- Then `found` SHALL be true
- And the primary symbol SHALL be that function
- And callers and callees SHALL match an exact-name explore of that function

#### Scenario: Missing stem falls through to the first function
- Given exactly one indexed file whose stem matches no symbol and that file defines at least one function
- When explore is invoked with that file's repo-relative path
- Then `found` SHALL be true
- And the primary symbol SHALL be the first function in that file by `start_line`

#### Scenario: Unique basename resolves to that file
- Given exactly one indexed file whose basename is `scroll.ts` and that file defines symbols
- When explore is invoked with `scroll.ts`
- Then `found` SHALL be true
- And the primary symbol SHALL be defined in that file

#### Scenario: Ambiguous basename lists symbols from each file
- Given two indexed files that share the basename `scroll.ts` and each defines symbols
- When explore is invoked with `scroll.ts`
- Then `found` SHALL be false
- And `otherMatches` SHALL list symbols from both files
- And the message SHALL state that the basename is ambiguous

#### Scenario: Declaration-less file resolves to its file-owner node
- Given an indexed test file that declares no symbol and imports `src/a.ts`
- When explore is invoked with that file's repo-relative path
- Then `found` SHALL be true
- And the primary node SHALL have kind `file`
- And its callees SHALL include a node defined in `src/a.ts`

#### Scenario: Symbol-less file without references resolves to its file-owner node
- Given an indexed file path that defines no symbol and has no import or call
- When explore is invoked with that path
- Then `found` SHALL be true
- And the primary node SHALL have kind `file` and no callees
- And the message SHALL state that the file declares no symbols
- And the message SHALL NOT claim zero similar symbols when sibling symbols exist

#### Scenario: Search fallback matches file paths
- Given a path-shaped query that matches more than one indexed file
- When explore falls back to search
- Then `otherMatches` SHALL include symbols from the matching paths
- And LIKE metacharacters `%` and `_` in the query SHALL be escaped
- And a name substring match SHALL still be returned when the path does not match

### Requirement: Explore returns the exact symbol source `req~explore-exact-source~1`

WHEN explore returns a symbol's source, Compass SHALL return exactly the text of the decoded file between that symbol's stored start and end offsets, treating `nodes.start_byte` and `nodes.end_byte` as UTF-16 code-unit offsets into the UTF-8-decoded source (the same units the parser and `rawHash` use), so that multibyte characters, astral characters, or a leading UTF-8 byte-order mark earlier in the file do not shift or truncate the returned source; and this guarantee bumps no schema and requires no reindex or drift reseal.

Needs: impl, itest

#### Scenario: Multibyte text before the symbol does not shift the source
- Given an indexed TypeScript file whose text before `export function target(…) { … }` contains `—`, `«»`, `ñ`, and an astral emoji
- When explore is invoked for `target` with source included
- Then the returned source SHALL start with `function target(`
- And the returned source SHALL end with `}`
- And the returned source SHALL equal the whole function declaration

#### Scenario: A leading byte-order mark does not shift the source
- Given an indexed TypeScript file that starts with a UTF-8 byte-order mark and defines the function `bommed`
- When explore is invoked for `bommed` with source included
- Then the returned source SHALL equal the whole declaration of `bommed`

### Requirement: No-op index fast path `req~index-noop-fast-path~1`

WHEN `compass_index` or `speclaw index` runs without force, without prune, and
without an explicit embedding-cache size cap, and the run re-extracts no file,
removes no file, and finds the project-root hash unchanged, the indexer SHALL
skip the directory-hash rewrite, edge resolution, import-edge resolution,
global PageRank recomputation, and the embedding cache touch and size eviction,
SHALL write only `meta.indexed_at` beyond the per-file stat columns it
refreshed, SHALL NOT rewrite `docs/compass.md` unless its map block (between
the `speclaw:map` markers) is empty, and SHALL still return the full index
statistics, including `totals` and `nextStep`. The indexer SHALL NOT create
`docs/compass.md` when it is absent. WHEN any of those
conditions does not hold, the indexer SHALL run the full post-processing and
SHALL write the compact map as before.

Needs: impl, itest
Status: proposed

#### Scenario: A no-op run leaves the compact map untouched
- Given a fully indexed project with `docs/compass.md` written by the last index
- And no filesystem changes since then
- When `speclaw index` runs
- Then the bytes and the mtime of `docs/compass.md` SHALL be unchanged
- And the result SHALL report the root hash unchanged
- And `totals.files`, `totals.nodes`, and `totals.edges` SHALL be greater than zero

#### Scenario: A no-op run skips global post-processing
- Given the same fully indexed, unchanged project
- When `compass_index` runs
- Then no `dir_hashes` row and no `pagerank` row SHALL be inserted, updated, or deleted
- And `meta.indexed_at` SHALL be later than its previous value

#### Scenario: An empty compact map block is refilled on a no-op run
- Given a fully indexed, unchanged project whose `docs/compass.md` map block was
  reset to empty markers
- When `speclaw index` runs
- Then the map block in `docs/compass.md` SHALL hold the compact map afterwards

#### Scenario: A changed file still runs the full pass
- Given a fully indexed project in which one indexed file's content changed
- When `speclaw index` runs
- Then that file SHALL be re-extracted
- And global PageRank SHALL be recomputed
- And the compact map SHALL be written

#### Scenario: Force, prune, and an explicit cache cap bypass the fast path
- Given a fully indexed, unchanged project
- When `speclaw index --force` runs, when `speclaw index --prune` runs, and when
  `speclaw index --max-cache-mb 256` runs
- Then each run SHALL perform the full post-processing

#### Scenario: The no-op index is not slower than main
- Given throwaway worktrees of `main` and the branch, each indexed and unchanged
- When `speclaw index` runs at least 20 times on each after 3 warm-up runs
- Then the branch median wall-clock time SHALL NOT exceed the `main` median
- And `reports/performance.md` SHALL record the median and p95 for both

### Requirement: Session-start index refresh `req~session-start-index~1`

WHEN `speclaw session-start` runs, the CLI SHALL resolve the project
from the working directory and SHALL ignore every flag. IF
`.speclaw/index.db` is absent, THEN the CLI SHALL exit with code 0 without
creating or opening an index. WHILE the index exists, the CLI SHALL run an
incremental index without force and without prune, SHALL print nothing on
stdout or stderr (no branded header, progress, summary, or update notice),
and SHALL NOT
append an entry to `.speclaw/compass-calls.jsonl`. IF the run fails for any
reason, including `SQLITE_BUSY` from a concurrent writer, THEN the CLI SHALL
exit with code 0 and print nothing. The top-level `speclaw help` text SHALL
list `session-start`, and `speclaw index` SHALL have no `--session-start`
flag.

Needs: impl, itest
Status: proposed

#### Scenario: No index means nothing happens
- Given a project with no `.speclaw/index.db`
- When `speclaw session-start` runs
- Then the exit code SHALL be 0
- And stdout and stderr SHALL be empty
- And `.speclaw/index.db` SHALL NOT exist afterwards

#### Scenario: An unchanged index refreshes silently
- Given a fully indexed, unchanged project
- When `speclaw session-start` runs
- Then the exit code SHALL be 0
- And stdout and stderr SHALL be empty
- And the bytes of `docs/compass.md` SHALL be unchanged

#### Scenario: A changed file is picked up
- Given a fully indexed project in which one indexed function body was edited
- When `speclaw session-start` runs
- Then the exit code SHALL be 0
- And `compass_explore` for that function SHALL return the edited source

#### Scenario: A locked database is swallowed
- Given a fully indexed project whose database is held by another connection's open `BEGIN IMMEDIATE` transaction
- When `speclaw session-start` runs
- Then the exit code SHALL be 0
- And stdout and stderr SHALL be empty

#### Scenario: The session-start run is not logged as a Compass call
- Given a fully indexed project and a Compass call log with known content
- When `speclaw session-start` runs
- Then `.speclaw/compass-calls.jsonl` SHALL be unchanged

#### Scenario: Help lists the session-start command
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL list `session-start`
- And the `speclaw index --help` text SHALL NOT mention `session-start`
