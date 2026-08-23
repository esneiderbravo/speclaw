# Code graph

Reverse reachability (blast radius) over the Compass index, static selection of
test files affected by a change, and history×structure intelligence (hotspots
and temporal coupling). Level 1 impact is graph-only — no coverage
instrumentation. Correctness prefers node ids over names; agent output prefers
counts over raw dumps; global config files never report an empty radius.
Hotspots expose two raw axes (activity and health) rather than a single opaque
score; coupling reports facts (`strength`, `in_graph`, `isTestPair`) without
judgmental labels.

### Requirement: Id-first reverse reachability

`compass_impact` / `speclaw query impact` SHALL compute the reverse dependency
closure of a target symbol (or of the symbols defined in a set of files) using
a single recursive SQL query. When `edges.dst_node_id` is non-NULL the join
SHALL use that id; when it is NULL the join MAY fall back to `edges.dst_name`.
By default the closure SHALL traverse edge kinds `call` and `import`. The
caller MAY restrict kinds. Every returned node SHALL declare whether its
shortest path was fully id-resolved (`exact`) or used at least one name
fallback (`by-name`). Cycles SHALL terminate; each node SHALL appear once at
its minimum depth. A hard result limit SHALL set `truncated: true` when hit.

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

#### Scenario: Restricting edge kinds excludes imports
- Given the same project
- When `compass_impact` is invoked with edge kinds equal to `["call"]`
- Then no node from `b.ts` SHALL appear solely by virtue of the import

#### Scenario: A cyclic graph terminates
- Given functions forming a call cycle
- When `compass_impact` runs with a finite `maxDepth`
- Then each affected node SHALL appear exactly once with its shortest depth
- And the call SHALL return without hanging

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

Compass schema version SHALL be `"8"`. Opening a stale database SHALL recreate
derived tables and force reindex. Every indexed file row SHALL carry `is_test`
(boolean derived from configured `testGlobs` at index time) and `module`
(stable path prefix / nearest package root heuristic). Query-time `LIKE` over
paths SHALL NOT be the primary test classifier.

#### Scenario: Schema 7 database is rebuilt on open
- Given an index stamped schema `"7"`
- When Compass opens the database under schema `"8"`
- Then derived tables SHALL be recreated
- And a needs-reindex marker SHALL be set

#### Scenario: Test files are marked at index time
- Given `src/foo.ts` and `src/foo.test.ts` with default test globs
- When the project is indexed
- Then `foo.test.ts` SHALL have `is_test = 1` and `foo.ts` SHALL have `is_test = 0`

### Requirement: Static affected-test selection

`compass_affected_tests` / `speclaw query affected-tests` SHALL return a
superset of the test files that could be affected by a change (files and/or
symbols and/or `--from-diff`), using reverse reachability into `is_test = 1`
files. It SHALL return an executable `command` string derived from the
project's `package.json` `scripts.test` when present, otherwise a sensible
runner default for the detected ecosystem (`node --test` for this package).
Global-file matches SHALL select the full suite (`mode: "all"`) with reason.
Present-but-unindexed language extensions SHALL produce warnings. Precise
coverage narrowing is OUT OF SCOPE for this capability revision.

#### Scenario: Only reachable tests are selected
- Given a project with 20 test files of which 2 transitively depend on the changed file
- When `compass_affected_tests` is invoked with that changed file
- Then exactly those 2 test files SHALL be returned
- And `skipped.files` SHALL be 18
- And `command` SHALL include both selected paths

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

Under schema `"8"`, every indexed definition node SHALL have a `node_metrics`
row with at least `loc` (`end_line - start_line + 1`), `max_nesting` (maximum
nesting depth of configured block types inside the definition), and `branches`
(decision-point count using language-specific tree-sitter node types; boolean
`&&`/`||` count, arithmetic operators do not). Metrics SHALL be computed during
extract/index, not by scanning source at query time.

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
source↔test pair by `files.is_test` (`isTestPair`). Commits that touch more than
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
