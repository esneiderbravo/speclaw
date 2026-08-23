# Spec drift

Deterministic detection that archived capability specs no longer match the
code they sealed. Structural hashes (not embeddings) compare sealed symbol
bodies to the current Compass graph. Committed JSON under `lawbook/anchors/`
is the durable store; SQLite holds a projection only.

### Requirement: Dual content hashes on indexed nodes

During indexing, Compass SHALL compute and persist for every definition node a
`body_hash` (hash of the exact source byte range) and a `norm_hash` (hash of a
tree-sitter structural walk that ignores comments and insignificant
whitespace while preserving string-literal contents and Python indentation
semantics). The schema version SHALL be `"6"` (from `"5"`). Opening a stale
database SHALL recreate derived tables, set a needs-reindex marker, and
rehydrate `spec_anchors` from committed JSON before any drift comparison.

#### Scenario: Cosmetic edit changes only body_hash
- Given an indexed function whose only change is a comment or Prettier reformat
- When the project is reindexed
- Then that node's `norm_hash` SHALL be unchanged
- And its `body_hash` SHALL differ

#### Scenario: Behavioural edit changes norm_hash
- Given an indexed function whose control flow or a string literal changes
- When the project is reindexed
- Then that node's `norm_hash` SHALL differ from the pre-edit value

#### Scenario: Schema 5 database is rebuilt safely
- Given a project whose index reports schema version `"5"`
- When Compass opens the database under schema `"6"`
- Then derived tables SHALL be recreated
- And a needs-reindex marker SHALL be set
- And anchors SHALL be rehydrated from `lawbook/anchors/*.json` when present

### Requirement: Committed anchors are the source of truth

speclaw SHALL persist sealed anchors as one JSON file per capability at
`lawbook/anchors/<capability>.json`, committed with the repository. The
SQLite `spec_anchors` table SHALL be a projection rebuilt from those files.
Deleting `.speclaw/` or changing schema version SHALL NOT destroy sealed
hashes.

#### Scenario: Fresh clone still has anchors
- Given a repository whose `lawbook/anchors/` directory is committed
- When the repository is cloned into an empty directory, indexed, and
  `speclaw drift` runs
- Then the anchors SHALL be present and classifiable

#### Scenario: Index deletion does not lose seals
- Given sealed anchors for a capability
- When `.speclaw/` is deleted and the project is reindexed
- Then `speclaw drift` SHALL report the same anchor count as before the deletion

### Requirement: Archive seals anchors

When `specArchive` completes successfully, speclaw SHALL extract symbol and
file candidates from the change's delta specs, resolve them against the
current graph, write or update `lawbook/anchors/<capability>.json`, and
project rows into `spec_anchors`. Each sealed row SHALL record capability,
requirement id (stable id when present), optional scenario id (empty string
when absent), symbol or path, resolution (`unique` | `ambiguous` |
`unresolved`), `norm_hash`, `body_hash`, `NORMALIZER_VERSION`, ISO archive
time, HEAD commit SHA when git is available, and extraction source. Zero
resolvable anchors SHALL produce a warning and SHALL NOT block archive.

#### Scenario: Successful archive writes committed JSON
- Given a change whose delta specs name a uniquely resolvable function in
  backticks inside a requirement
- When the change is archived
- Then `lawbook/anchors/<capability>.json` SHALL contain a unique-resolution
  anchor for that function with both hashes populated

#### Scenario: Zero anchors warn but do not block
- Given a change whose delta specs yield no resolvable graph symbols
- When the change is archived
- Then archive SHALL succeed
- And the result SHALL warn that no anchors were sealed

### Requirement: Extraction prefers coverage links and precision

Candidate extraction SHALL prefer `covers-link` targets derived from
requirement ids / `coverage_links`, then backtick identifiers and paths, then
casing tokens. Casing candidates that do not resolve uniquely SHALL be
discarded silently. Backtick or covers-link candidates that do not resolve
SHALL be sealed as `unresolved` (reported later as `orphan`). Ambiguous names
SHALL retain every candidate or an ambiguous marker; speclaw SHALL NOT pick
one match at random.

#### Scenario: Unresolved casing is dropped
- Given prose containing an unresolved CamelCase token without backticks
- When anchors are extracted at archive time
- Then that token SHALL NOT appear as an anchor

#### Scenario: Unresolved backtick becomes orphan
- Given a requirement containing `` `missingFn` `` that is absent from the graph
- When anchors are extracted and later classified
- Then the anchor SHALL be reported as `orphan`

### Requirement: Drift classification

`speclaw drift` / `lawbook_drift` SHALL classify each sealed anchor as exactly
one of: `unchanged`, `changed-cosmetic`, `changed-semantic`, `moved`,
`deleted`, `orphan`, `ambiguous`, `unanchored`, `stale-hash`. Classification
SHALL use `norm_hash` / `body_hash` comparison and SHALL NOT use embeddings.
A matching `norm_hash` on a different path SHALL be `moved`. A
`NORMALIZER_VERSION` mismatch SHALL be `stale-hash`, not semantic drift.

#### Scenario: Prettier-only change is cosmetic
- Given a sealed unique anchor
- When only formatting/comments change in that symbol and the index is refreshed
- Then the verdict SHALL be `changed-cosmetic`

#### Scenario: Body rewrite is semantic
- Given a sealed unique anchor
- When the symbol's control flow changes and the index is refreshed
- Then the verdict SHALL be `changed-semantic`

#### Scenario: Verbatim move is moved
- Given a sealed unique anchor in `src/a.ts`
- When the function body is moved unchanged to `src/b.ts` and the index is
  refreshed
- Then the verdict SHALL be `moved`
- And the report SHALL name `src/b.ts`

#### Scenario: Editing a sibling symbol does not drift the anchor
- Given sealed anchor for function `a` in a file that also defines `b`
- When only `b` changes
- Then the verdict for `a` SHALL be `unchanged`

### Requirement: Fail-on thresholds and exit codes

`--fail-on` SHALL accept `none` | `cosmetic` | `semantic` | `any`. The default
for both interactive CLI and MCP SHALL be `semantic`. Exit code `0` means no
finding at or above the threshold; `1` means threshold breached; `2` means
CLI/usage/index error (including needs-reindex without a usable graph).
`changed-cosmetic` and `moved` SHALL NOT fail `--fail-on semantic`.
`unanchored` and `stale-hash` SHALL NOT fail any threshold except that
`orphan` and `ambiguous` fail only under `any`.

#### Scenario: Default interactive fail-on is semantic
- Given one `changed-semantic` anchor and no other defects
- When `speclaw drift` runs with no `--fail-on` flag
- Then the process SHALL exit `1`

#### Scenario: Cosmetic does not fail semantic threshold
- Given only `changed-cosmetic` findings
- When `speclaw drift --fail-on semantic` runs
- Then the process SHALL exit `0`

#### Scenario: Missing index exits two
- Given a project with no usable Compass index
- When `speclaw drift` runs
- Then the process SHALL exit `2`
- And no anchor SHALL be reported as `deleted` solely because the index is empty

### Requirement: Bootstrap reseal

speclaw SHALL provide `speclaw drift --reseal` (optionally
`--capability <name>`) that re-photographs anchors from the current graph and
rewrites committed JSON with an audit trail (timestamp, HEAD SHA,
normalizer version). Shipping this change SHALL reseal this repository's
archived capabilities so drift is immediately meaningful.

#### Scenario: Reseal updates hashes without changing symbol set arbitrarily
- Given existing anchors for capability `cli`
- When `speclaw drift --reseal --capability cli` runs against a matching graph
- Then the JSON file SHALL update hashes and seal metadata
- And the subsequent `speclaw drift` run SHALL report those anchors `unchanged`

### Requirement: Reverse drift

When capabilities declare `paths` globs, `speclaw drift --reverse` SHALL
report exported/top-level symbols under those paths that no sealed anchor
covers, excluding configured test/generated globs, aggregated by file with a
configurable minimum symbol count. When no capability paths are declared,
reverse detection SHALL be disabled and SHALL explain what to configure —
it SHALL NOT emit a mass of uncovered symbols and SHALL NOT affect the exit
code.

#### Scenario: Uncovered exports are reported when paths exist
- Given capability `cli` with `paths: ["src/cli/**"]` sealed 20 days ago
- And four exported functions under `src/cli/` with no anchors
- When `speclaw drift --reverse --json` runs
- Then the reverse section SHALL list that area with uncovered symbol counts

#### Scenario: Reverse disabled without paths
- Given no capability `paths` in lawbook config
- When `speclaw drift --reverse` runs
- Then the command SHALL report that reverse detection is disabled
- And the exit code SHALL NOT be influenced by reverse findings

### Requirement: CLI and MCP surfaces

The CLI SHALL dispatch `speclaw drift` with flags `--json`, `--capability`,
`--fail-on`, `--reverse`, `--reseal`, `--explain`, and `--since`. Non-TTY /
`--json` output SHALL omit the branded header. The MCP tool `lawbook_drift`
SHALL return a defect-first summary bounded for agent context (≤ 700 tokens /
≤ 3000 characters of listed defects) and SHALL instruct agents to call it
before claiming a task is complete.

#### Scenario: JSON report is header-free
- Given an initialised project with an index
- When `speclaw drift --json` runs on a TTY
- Then stdout SHALL parse as JSON with a schema version and summary
- And no branded header SHALL appear

#### Scenario: MCP response is bounded
- Given forty drifted anchors
- When `lawbook_drift` is invoked with a small max-items limit
- Then at most that many individual anchors SHALL be listed
- And remaining findings SHALL appear as counts

### Requirement: Doctor and verify integration

`speclaw doctor` SHALL include a drift summary check (anchor counts and
semantic/deleted totals, with a remedy naming `speclaw drift`).
`speclaw verify --ci` SHALL incorporate semantic and deleted drift findings
into its SARIF/report stream when anchors exist, without claiming requirement
coverage.

#### Scenario: Doctor names drift remedy
- Given sealed anchors with at least one semantic finding
- When `speclaw doctor --json` runs
- Then a drift-related check SHALL be present
- And its remedy SHALL mention `speclaw drift`

#### Scenario: Verify CI surfaces semantic drift
- Given sealed anchors with a `changed-semantic` finding
- When `speclaw verify --ci --sarif out.sarif` runs
- Then the SARIF output SHALL include a drift finding for that anchor
