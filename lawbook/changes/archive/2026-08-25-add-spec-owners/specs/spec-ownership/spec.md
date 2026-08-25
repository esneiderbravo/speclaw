# Spec ownership

Declared capability ownership compiled into a managed `CODEOWNERS` block so
teams can answer who must review changes to each lawbook capability. Governs
`team.owners` in `lawbook/config.yaml`, the `# >>> speclaw:owners` merge
contract, and the rules that keep the block last in the file. Does not govern
change locks, dashboards, metrics, or issue sync.

### Requirement: Compile declared owners into a trailing CODEOWNERS block `req~owners-compile~1`

WHEN `lawbook/config.yaml` declares `team.owners` as a map from capability name
(or the literal key `"*"`) to a non-empty list of owner tokens, the system SHALL
compile those declarations into a single marked block bounded by
`# >>> speclaw:owners` and `# <<< speclaw:owners`, and that block SHALL be the
last non-empty content in `.github/CODEOWNERS` so that no later user pattern
silently overrides it. Each named capability key SHALL produce patterns covering
`lawbook/specs/<capability>/` and `lawbook/changes/*/specs/<capability>/`. The
`"*"` key SHALL produce patterns covering at least `lawbook/config.yaml` and
`docs/standards/`. Owner tokens on each line SHALL be space-separated.

Needs: impl, utest
Status: proposed

#### Scenario: Named capability becomes a CODEOWNERS pattern
- Given `team.owners` maps `quality-gates` to `["@org/platform"]`
- When the owners block is written
- Then `.github/CODEOWNERS` SHALL contain a pattern matching
  `lawbook/specs/quality-gates/` assigned to `@org/platform`
- And SHALL contain a pattern matching `lawbook/changes/*/specs/quality-gates/`
  assigned to `@org/platform`
- And the `# <<< speclaw:owners` marker SHALL be the last non-empty line in the
  file

#### Scenario: Star owners cover config and standards
- Given `team.owners` maps `"*"` to `["@org/architecture"]`
- When the owners block is written
- Then the block SHALL assign `@org/architecture` to `lawbook/config.yaml`
- And SHALL assign `@org/architecture` to a pattern covering `docs/standards/`

### Requirement: Merge preserves user CODEOWNERS outside markers `req~owners-merge~1`

WHEN writing the speclaw owners block, the system SHALL preserve all
user-authored content outside the `# >>> speclaw:owners` … `# <<< speclaw:owners`
markers and SHALL replace only the content between those markers (creating the
markers when absent). The system MUST NOT delete user patterns that appear
before the start marker.

Needs: impl, utest
Status: proposed

#### Scenario: User rules before the block survive a rewrite
- Given `.github/CODEOWNERS` contains a user pattern `docs/** @someone` before
  any speclaw markers
- When `speclaw owners --write` runs with a valid `team.owners` map
- Then `docs/** @someone` SHALL still appear in the file
- And a regenerated speclaw owners block SHALL appear after the user content

#### Scenario: Rewriting updates only the marked region
- Given an existing speclaw owners block with stale capability lines
- When owners are recompiled from an updated `team.owners` map
- Then content between the markers SHALL match the new map
- And content outside the markers SHALL be unchanged

### Requirement: Absent owners declaration is a no-op `req~owners-absent~1`

IF `lawbook/config.yaml` is missing or does not declare `team.owners`, THEN
writing owners SHALL NOT create a speclaw owners block and SHALL NOT invent
default owners. The operation SHALL exit successfully with a message that
nothing was written.

Needs: impl, utest
Status: proposed

#### Scenario: No team.owners leaves CODEOWNERS untouched
- Given a project with no `team.owners` key
- And an existing `.github/CODEOWNERS` without speclaw markers
- When `speclaw owners --write` runs
- Then the CODEOWNERS file content SHALL be unchanged
- And the process SHALL exit `0`

### Requirement: Owner tokens are validated locally `req~owners-syntax~1`

WHEN compiling or checking owners, the system SHALL accept only tokens that
match a GitHub-style `@user`, `@org/team`, or a simple email address. IF a
token fails that syntax, THEN `--write` SHALL fail with a clear error naming
the bad token, and doctor SHALL report the bad token. The system MUST NOT
require network access to GitHub to accept a syntactically valid token.

Needs: impl, utest
Status: proposed

#### Scenario: Typo token fails write
- Given `team.owners` includes the token `not-an-owner`
- When `speclaw owners --write` runs
- Then the process SHALL exit non-zero
- And the message SHALL name `not-an-owner`

#### Scenario: Valid forms are accepted without network
- Given `team.owners` lists `@esneiderbravo`, `@org/platform`, and
  `owner@example.com`
- When owners are compiled offline
- Then compilation SHALL succeed
- And no GitHub API request SHALL be required

### Requirement: Derive-from-traceability stays off in this release `req~owners-no-derive~1`

The system SHALL NOT generate CODEOWNERS patterns from requirement→code
traceability in this release. IF a `deriveFromTraceability` (or equivalent) knob
appears in config, THEN it SHALL default to false and MUST NOT emit derived
`src/**` ownership lines when unset or false.

Needs: impl, utest
Status: proposed

#### Scenario: Default compile emits only declared paths
- Given `team.owners` maps `cli` to `["@org/dx"]` and omits any derive flag
- When the owners block is written
- Then the block SHALL NOT contain patterns under `src/` derived from the graph
- And SHALL contain the declared `lawbook/specs/cli/` pattern
