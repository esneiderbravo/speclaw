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
`compass_find`.

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

Compass schema version SHALL be `"10"`. Opening a schema `"8"` database SHALL
migrate in place toward the current schema (embeddings preserved through the
8→9 path). Opening a schema `"9"` database SHALL migrate to `"10"` (FTS and
pagerank tables) and force a text reindex while reusing the embedding cache when
the embedder model id is unchanged. Opening other stale databases SHALL
recreate derived tables and force reindex. Every indexed file row SHALL carry
`is_test` (boolean derived from configured `testGlobs` at index time) and
`module` (stable path prefix / nearest package root heuristic). Query-time
`LIKE` over paths SHALL NOT be the primary test classifier.

#### Scenario: Schema 7 database is rebuilt on open
- Given an index stamped schema `"7"`
- When Compass opens the database under schema `"10"`
- Then derived tables SHALL be recreated
- And a needs-reindex marker SHALL be set

#### Scenario: Schema 9 migrates to 10 without wiping embeddings
- Given an index stamped schema `"9"` with a populated `embedding_cache`
- When Compass opens the database under schema `"10"`
- Then `node_text` / FTS / `pagerank` structures SHALL exist (or FTS omitted with soft degrade)
- And `embedding_cache` rows SHALL remain
- And a reindex SHALL be required to populate `node_text`

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

Under schema `"10"`, every indexed definition node SHALL have a `node_metrics`
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

### Requirement: Consolidated Compass MCP surface

The Compass MCP module SHALL expose **`compass_explore`**, **`compass_find`**,
**`compass_diff_context`**, and **`compass_index`** as canonical tools.
`compass_explore` SHALL return symbol source, callers, callees, aggregated blast
radius, affected tests, and hotspot standing in one response when requested via
default includes. `compass_find` SHALL run the **hybrid retrieval** pipeline for
every call; `mode: exact | concept` SHALL only adjust fusion weights (sparse-
heavy vs dense-heavy), not select a single stage. `compass_diff_context` SHALL
return changed symbols, aggregated blast radius, affected tests, and hotspots
for a git revision or working tree in one call. Retired names (`compass_search`,
`compass_recall`, `compass_impact`, `compass_trace`, `compass_affected_tests`,
`compass_hotspots`, `compass_coupling`, `compass_watch`) SHALL delegate through
deprecation aliases for two minor versions.

#### Scenario: One explore call replaces impact and tests
- Given an indexed project containing symbol `renderInit`
- When `compass_explore` is invoked for `renderInit` with default includes
- Then the response SHALL contain blast-radius summary and affected-test count
- And no further tool call SHALL be required for those signals

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

#### Scenario: Reindexing A leaves B untouched
- Given an indexed project where file A's symbols are called from file B
- When file A is modified and re-indexed
- Then no `nodes` or `edges` row whose owning file is B SHALL be inserted,
  updated, or deleted

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
