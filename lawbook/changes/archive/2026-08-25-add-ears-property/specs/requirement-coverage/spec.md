# Requirement coverage

Deterministic requirement → implementation → test coverage for speclaw specs.
Stable OpenFastTrace-shaped identifiers, comment- and inline-derived coverage
links, a TAP/JSON report, an MCP tool for agents, and an opt-in archive gate.
Call-path tracing remains `compass_trace` / `speclaw trace` and is out of scope.

### Requirement: Spec item identity

Every requirement heading in a lawbook spec MAY declare a stable identifier of
the form `<artifact-type>~<name>~<revision>` as inline code in the same
`### Requirement:` heading. speclaw SHALL treat that identifier — not the
requirement title — as the item's identity. When no identifier is present,
speclaw SHALL ignore the heading for coverage purposes rather than fail.

#### Scenario: Identifier parsed from the requirement heading
- Given a spec containing `### Requirement: Hook generation` followed by the
  inline code `req~hook-generation~1` in the same heading
- When `speclaw coverage --json` runs
- Then the report SHALL contain an item with id `req~hook-generation~1`
- And the item's title SHALL be `Hook generation`

#### Scenario: Renaming the title does not change the identity
- Given a requirement with id `req~hook-generation~1` covered by one `impl`
  link and one `utest` link
- When the requirement's title is changed and the identifier is left untouched
- Then the item SHALL still be reported as shallow-covered
- And no link status SHALL change

#### Scenario: Requirements without identifiers are ignored, not failed
- Given a spec whose requirements declare no identifiers
- When `speclaw coverage` runs
- Then the exit code SHALL be `0`
- And the output SHALL state that no identified requirements were found and
  name the adopt command

#### Scenario: Duplicate identifiers are ambiguous
- Given two requirements in the same project declaring `req~hook-generation~1`
- When `speclaw coverage` runs
- Then both items SHALL be reported with a direct defect naming the duplicate
- And both source locations SHALL be listed as `<specPath>:<line>`

### Requirement: Coverage keywords on spec items

An identified requirement MAY declare `Status:`, `Needs:`, `Tags:`, `Depends:`,
`Covers:`, and `Verification:` keywords in its body. When `Needs:` is absent,
speclaw SHALL apply the configured `coverage.defaultNeeds` (default
`[impl, utest]`). WHEN `Verification: property` is present, effective needs
SHALL include `ptest` even if `Needs:` omitted that token. `Needs: ptest` SHALL
remain the source of truth for declaring a property need. When `Status:` is
absent, speclaw SHALL treat the item as `approved`. speclaw SHALL NOT invent
`Needs:` during adopt.

#### Scenario: Default needs apply when omitted
- Given an identified requirement with no `Needs:` line
- And default needs `[impl, utest]`
- When coverage is computed
- Then the item SHALL require both `impl` and `utest`

#### Scenario: Draft status does not affect the exit code by default
- Given an identified requirement with `Status: draft` and no links
- When `speclaw coverage` runs with default gate statuses
- Then the item SHALL be reported as uncovered
- And the exit code SHALL be `0`

### Requirement: Coverage link discovery

speclaw SHALL discover coverage links from comment nodes in the Compass AST
walk during index, and from inline `[@test …]` / `[@impl …]` markers in specs.
speclaw MUST NOT discover links from string literals.

#### Scenario: Comment link is discovered and attributed to a symbol
- Given a TypeScript file containing `// Covers: req~hook-generation~1` on the
  line directly above an exported function
- When the project is indexed
- Then a coverage link SHALL exist with target `req~hook-generation~1`,
  origin `comment`, and that function's node id

#### Scenario: A string literal is not a link
- Given a source file containing `const msg = "// Covers: req~fake~1";` and no
  comment with that text
- When the project is indexed
- Then no coverage link with target `req~fake~1` SHALL exist

#### Scenario: Python comment links are discovered
- Given a Python file containing `# Covers: req~python-indexing~1` above a
  function definition
- When the project is indexed
- Then a coverage link SHALL exist for that requirement

#### Scenario: Multiple targets on one line
- Given a comment `// Covers: req~a~1, req~b~2`
- When the project is indexed
- Then two coverage links SHALL exist, one per target

#### Scenario: Inline test link in a spec
- Given a scenario heading ending with `[@test test/unit/hooks.test.ts]`
- And that file exists and matches the `utest` source glob
- When `speclaw coverage` runs
- Then a link of source type `utest` and origin `inline-test-link` SHALL cover
  the enclosing requirement

#### Scenario: Inline test link to a missing file
- Given a scenario heading ending with `[@test test/unit/does-not-exist.test.ts]`
- When `speclaw coverage` runs
- Then the link SHALL be reported as `Orphaned`
- And the reported location SHALL be the spec file and line

### Requirement: Artifact type inference

speclaw SHALL infer the artifact type of a covering artifact from its file path
using configured source globs (`impl`, `utest`, `itest`, and `ptest` when
configured). WHEN a coverage link's nearby source invokes a configured property
runner, speclaw SHALL classify that link as `ptest` even if the path also
matches a `utest` glob.

#### Scenario: Test and source paths map to different types
- Given source globs mapping `src/**` to `impl` and `test/unit/**` to `utest`
- And a requirement needing `impl, utest`, with one link from each location
- When `speclaw coverage` runs
- Then the item SHALL be shallow-covered
- And `coveredTypes` SHALL contain exactly `impl` and `utest`

#### Scenario: Link from an excluded path does not count
- Given a link declared in a file matching `coverage.exclude`
- When `speclaw coverage` runs
- Then that link SHALL NOT appear as covering evidence
- And the requirement SHALL remain uncovered for that artifact type

#### Scenario: Property runner window classifies ptest
- Given a requirement with `Needs: ptest`
- And a `// Covers:` comment above a `fc.assert(` invocation in a test file
- When `speclaw coverage` runs
- Then the link's source type SHALL be `ptest`
- And `ptest` SHALL count toward covered needs

### Requirement: Property need and runner recognition `req~ptest-need~1`

WHEN an identified requirement's effective needs include `ptest`, the system
SHALL treat a missing `ptest` covering link as a direct coverage defect.
speclaw SHALL recognize property runners only from configured
`propertyRunners` patterns near the covering link, SHALL ignore pattern
substrings inside string literals, and SHALL NOT execute tests as part of
coverage.

Needs: impl, utest, ptest
Status: approved

#### Scenario: Missing ptest is a direct defect
- Given an identified requirement with `Needs: impl, utest, ptest`
- And only `impl` and `utest` links exist
- When `speclaw coverage --json` runs
- Then `uncoveredTypes` SHALL contain `ptest`
- And the item SHALL contribute a direct defect naming `ptest`

#### Scenario: Verification property expands needs
- Given an identified requirement with `Verification: property` and no `ptest`
  token in `Needs:`
- When coverage is computed
- Then effective needs SHALL include `ptest`

#### Scenario: Coverage does not run the property suite
- Given a requirement covered by a recognized `ptest` link whose body would fail
  if executed
- When `speclaw coverage` runs
- Then the exit code SHALL reflect link/existence status only
- And speclaw SHALL NOT execute the property runner

### Requirement: Revision invalidates coverage

Raising a requirement's revision SHALL invalidate every existing link that
targets a lower revision.

#### Scenario: Coverage becomes outdated when the revision is raised
- Given a requirement `req~coverage-gate~1` fully covered by an `impl` link and
  a `utest` link
- When the identifier is changed to `req~coverage-gate~2` and no link is updated
- Then both links SHALL be reported with status `Outdated`
- And the item SHALL have a direct defect
- And the exit code SHALL be `1`

#### Scenario: Updating the links restores coverage
- Given the outdated state above
- When both link comments are updated to target `req~coverage-gate~2`
- Then both links SHALL be reported with status `Covers`
- And the exit code SHALL be `0`

#### Scenario: A link ahead of the spec is predated
- Given a requirement at revision `2` and a link targeting revision `3`
- When `speclaw coverage` runs
- Then the link SHALL be reported with status `Predated`

### Requirement: Coverage computation and defects

speclaw SHALL compute shallow and deep coverage per item and classify defects as
direct or transitive. Code artifacts (`impl`, `utest`, `itest`) are leaves and
are deep-covered by definition. Cycles in `Covers:` / `Depends:` SHALL be
reported as defects without crashing.

#### Scenario: Missing needed type is a direct defect
- Given a requirement needing `impl, utest` with only an `impl` link
- When `speclaw coverage --json` runs
- Then `uncoveredTypes` SHALL contain `utest`
- And `shallow` SHALL be `false`
- And the item SHALL contribute to `summary.directDefects`

#### Scenario: Rejected requirement with coverage is unwanted
- Given a requirement with `Status: rejected` and one `impl` link
- When `speclaw coverage` runs
- Then the link SHALL be reported with status `Unwanted` and reason
  `item-rejected`

#### Scenario: A dependency cycle is a defect, not a crash
- Given two spec items whose `Covers:` keywords reference each other
- When `speclaw coverage` runs
- Then the command SHALL terminate
- And the report SHALL name the cycle as a defect

### Requirement: Machine-readable coverage gate

`speclaw coverage` SHALL emit a TAP-compatible summary on non-TTY (or with
`--tap`), a readable table on TTY, and stable `--json`. Exit codes SHALL be
`0` (clean), `1` (defects), `2` (invocation / project error).

#### Scenario: Clean project
- Given every approved identified requirement is shallow- and deep-covered
- When `speclaw coverage` runs in a non-TTY environment
- Then the final line SHALL match `ok - <n> total`
- And the exit code SHALL be `0`

#### Scenario: Project with defects
- Given three direct defects and one transitive defect
- When `speclaw coverage` runs in a non-TTY environment
- Then the final line SHALL report those defect counts
- And the exit code SHALL be `1`

#### Scenario: JSON output is deterministic
- Given any project
- When `speclaw coverage --json` runs twice without changes
- Then both payloads SHALL be byte-identical except for a timestamp field

### Requirement: MCP tool for agents

speclaw SHALL register an MCP tool `lawbook_coverage` (not `*trace*`) that
answers which requirements lack coverage before an agent declares work done.
Default `onlyDefects` SHALL be true. Rendered agent text SHALL be ≤ 600 tokens
and SHALL include a concrete next action.

#### Scenario: Tool name does not collide with compass_trace
- Given the MCP server is running
- When tools are listed
- Then `lawbook_coverage` SHALL be present
- And no lawbook tool whose name contains `trace` SHALL be registered

#### Scenario: Default response is defect-first
- Given a project with covered and uncovered approved requirements
- When `lawbook_coverage` is invoked with defaults
- Then the response SHALL list uncovered / outdated items first
- And SHALL omit fully healthy items unless `onlyDefects` is false

### Requirement: Identifier adoption

speclaw SHALL propose stable identifiers for existing requirements without
modifying personalized files unless explicitly instructed.

#### Scenario: Dry run by default
- Given a spec with three requirements and no identifiers
- When `speclaw coverage --adopt` runs without `--write`
- Then the proposed identifiers SHALL be printed
- And the spec file SHALL be unchanged on disk
- And the exit code SHALL be `0`

#### Scenario: Writing identifiers respects personalized ownership
- Given the same spec
- When `speclaw coverage --adopt --write` runs
- Then each requirement heading SHALL gain an identifier at revision `1`
- And a backup SHALL be taken per ownership rules
- And no `Needs:` keyword SHALL be invented

#### Scenario: Colliding slugs are disambiguated and reported
- Given two requirements whose titles slugify identically
- When `speclaw coverage --adopt` runs
- Then the second proposed identifier SHALL be suffixed for uniqueness
- And the collision SHALL be reported explicitly

### Requirement: Derived coverage links in the Compass schema

Compass SHALL persist discovered coverage links in the index database under
schema version `"5"`. Spec items SHALL NOT be persisted. Reindex SHALL rebuild
links exactly from comment nodes.

#### Scenario: Schema bump rebuilds links
- Given an index at schema `"4"`
- When the next index runs after this change ships
- Then the schema version SHALL become `"5"`
- And `coverage_links` SHALL be populated from comment directives

### Requirement: Performance budgets

Parsing ≤300 identified items SHALL finish in under 15 ms on a developer
laptop-class machine. A full `speclaw coverage` over a 5k-node index SHALL
finish in under 250 ms excluding cold index. Comment scanning inside
`compass_index` SHALL add less than 3% wall time versus the prior walk.

#### Scenario: Coverage CLI stays interactive-fast
- Given a fixture project with ≥100 identified requirements and ≥500 links
- When `speclaw coverage --json` runs against a warm index
- Then it SHALL complete in under 250 ms
