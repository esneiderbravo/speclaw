# Code graph

Reverse reachability (blast radius) over the Compass index, and static
selection of test files affected by a change. Level 1 is graph-only — no
coverage instrumentation. Correctness prefers node ids over names; agent
output prefers counts over raw dumps; global config files never report an
empty radius.

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

Compass schema version SHALL be `"7"` (from `"6"`). Opening a stale database
SHALL recreate derived tables and force reindex. Every indexed file row SHALL
carry `is_test` (boolean derived from configured `testGlobs` at index time)
and `module` (stable path prefix / nearest package root heuristic). Query-time
`LIKE` over paths SHALL NOT be the primary test classifier.

#### Scenario: Schema 6 database is rebuilt on open
- Given an index stamped schema `"6"`
- When Compass opens the database under schema `"7"`
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

#### Scenario: Invalid config fails fast
- Given a malformed `.speclaw/affected.json`
- When affected-tests is invoked
- Then the command SHALL exit non-zero with an error naming the config file
- And SHALL NOT return a partial selection
