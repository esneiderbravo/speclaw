# Operational trust

Diagnostics, publication integrity, install-channel stability, and the privacy
posture that make speclaw adoptable. Governs the versioned `DoctorReport`,
default redaction, issue-intake contract, npm provenance documentation and
workflow guarantees, the frozen install one-liner, and the absence of telemetry
in the package.

### Requirement: Machine-readable diagnostics

speclaw SHALL provide a diagnostic report in a versioned JSON format containing
environment, configuration, authentication, connectivity, and notes sections.

#### Scenario: JSON report carries a schema version and an overall status
- Given an initialised project
- When `speclaw doctor --json` runs
- Then the output SHALL be valid JSON containing a `schemaVersion` field equal
  to `1`
- And it SHALL contain all five sections
- And its top-level `status` SHALL equal the worst status among its sections

#### Scenario: Every warning and error carries a remedy
- Given a project whose index is stale under the freshness rule
- When `speclaw doctor --json` runs
- Then the index freshness check SHALL have status `warn` or `error`
- And it SHALL carry a non-empty `remedy` string

#### Scenario: Uninitialised project still reports its environment
- Given a directory with no speclaw manifest
- When `speclaw doctor --json` runs
- Then the environment section SHALL contain the Node version check
- And every configuration check SHALL have status `skip`

### Requirement: Installation-specific checks

The diagnostic report SHALL verify the integrity of the speclaw installation
across every configured agent surface, including MCP server configuration and
exposed tool count when a self-probe succeeds.

#### Scenario: MCP server reachability and tool count are reported
- Given an agent surface with a registered speclaw MCP server whose command
  resolves
- When the diagnostic runs a self-probe
- Then the report SHALL state whether the probe succeeded
- And when the probe succeeds, it SHALL state the number of tools the server
  exposes

#### Scenario: Unregistered server is distinguished from unreachable server
- Given one agent surface with no speclaw MCP registration
- And one agent surface with a registration whose probe fails
- When the diagnostic runs
- Then the two checks SHALL report different details
- And neither SHALL have status `error`

#### Scenario: Stale index reports elapsed time and drift
- Given an index whose `indexed_at` is more than seven days ago
- And tracked files modified since that time
- When the diagnostic runs
- Then the check SHALL report the age of the index
- And it SHALL report how many tracked files changed since it was built
- And its status SHALL be `warn`

#### Scenario: Missing indexed_at is skip not error
- Given an index database without a `meta.indexed_at` key
- When the diagnostic runs
- Then the freshness check SHALL have status `skip`
- And it SHALL carry a remedy that mentions indexing

### Requirement: Diagnostic privacy

The diagnostic report SHALL be redacted by default so that it can be pasted into
a public issue, and SHALL declare whether redaction was applied.

#### Scenario: Absolute paths are redacted by default
- Given a project located under the user's home directory
- When `speclaw doctor --json` runs without `--no-redact`
- Then the output SHALL NOT contain the user's home directory path
- And the output SHALL NOT contain the operating system user name as a path
  segment
- And the report's `redacted` field SHALL be true

#### Scenario: Report never contains file contents
- Given a project with configuration findings that name files
- When `speclaw doctor --json` runs
- Then the report MAY name the files
- And the report SHALL NOT contain any line of those files' contents

#### Scenario: `--no-redact` declares redacted false
- Given any project
- When `speclaw doctor --json --no-redact` runs
- Then the report's `redacted` field SHALL be false

### Requirement: Local-only authentication posture

The authentication section SHALL state that speclaw stores no credentials and
performs no authenticated network requests for its core workflow.

#### Scenario: auth.none is ok with an explicit local-only detail
- Given any project
- When `speclaw doctor --json` runs
- Then the authentication section SHALL include a check with id `auth.none`
- And that check SHALL have status `ok`
- And its detail SHALL state that speclaw runs without stored credentials

### Requirement: Connectivity without false failures

Registry and egress checks SHALL NOT fail the diagnostic merely because the
machine is offline.

#### Scenario: Offline skips registry check
- Given `--offline` is passed
- When `speclaw doctor --json` runs
- Then `conn.registry` SHALL have status `skip`
- And the process SHALL NOT fail solely because the registry was not contacted

#### Scenario: Egress inventory is explicit
- Given any project
- When `speclaw doctor --json` runs
- Then `conn.egress` SHALL list every network request speclaw may make
- And the list SHALL include the npm version check as the only default egress
  unless a later change adds another and updates this requirement

### Requirement: Verifiable publication

Every published release SHALL carry a provenance attestation produced by the
project's own CI workflow, and the release workflow SHALL NOT use a long-lived
registry token.

#### Scenario: Publish workflow requests an OIDC identity token
- Given the release workflow definition at `.github/workflows/publish.yml`
- When it is inspected by the suite
- Then it SHALL declare `id-token: write`
- And it SHALL NOT reference a long-lived registry authentication token
  (`NODE_AUTH_TOKEN`, `NPM_TOKEN`, or `secrets.NPM_TOKEN`)

#### Scenario: Publish runs quality gates before publish
- Given `.github/workflows/publish.yml`
- When it is inspected by the suite
- Then a `check` step and a `test` step SHALL appear before the publish step

#### Scenario: README documents provenance verification
- Given the repository README
- When a reader follows the provenance section
- Then it SHALL include commands that verify signatures or attestations for the
  published package

### Requirement: Stable install one-liner

The documented primary install command SHALL be stable and SHALL appear as the
first copy-pasteable install command in the README.

#### Scenario: README leads with the frozen one-liner
- Given the repository README
- When a reader looks for how to install
- Then the first copy-pasteable install command SHALL be exactly
  `npx @esneiderbravo/speclaw@latest init`
- And `CONTRIBUTING.md` SHALL state that this one-liner MUST NOT change in a
  breaking way

### Requirement: Issue intake requires doctor JSON

Bug reports against this repository SHALL require a redacted doctor JSON report.

#### Scenario: Bug report template requires doctor output
- Given `.github/ISSUE_TEMPLATE/bug_report.yml`
- When the template is inspected
- Then it SHALL include a required field for `speclaw doctor --json` output

### Requirement: No telemetry in the package

speclaw SHALL NOT transmit usage analytics. The CLI SHALL expose a status
command that states this posture.

#### Scenario: telemetry status reports absence
- Given `speclaw` is installed
- When a user runs `speclaw telemetry status`
- Then the output SHALL state that speclaw includes no telemetry
- And the process SHALL exit `0`

#### Scenario: No telemetry enable path
- Given `speclaw` is installed
- When a user runs `speclaw telemetry enable`
- Then the command SHALL fail with a message that telemetry is not available
- And no network request SHALL be made for analytics

### Requirement: Doctor exit codes distinguish diagnosis from gates

`speclaw doctor` SHALL exit `0` when there are no `error` checks, even if
warnings exist, unless `--strict` is set.

#### Scenario: Warnings alone exit zero
- Given a project whose worst check status is `warn`
- When `speclaw doctor` runs without `--strict`
- Then the process SHALL exit `0`

#### Scenario: Errors exit non-zero
- Given a project with at least one check of status `error`
- When `speclaw doctor` runs
- Then the process SHALL exit non-zero

#### Scenario: Strict treats warnings as failure
- Given a project whose worst check status is `warn`
- When `speclaw doctor --strict` runs
- Then the process SHALL exit non-zero

### Requirement: Doctor reports structural drift summary

`speclaw doctor` SHALL include a check summarising sealed-anchor drift
(anchor counts and semantic/deleted totals when anchors exist). When semantic
or deleted drift is present, the check SHALL be at least `warn` and its remedy
SHALL name `speclaw drift`. When no anchors are present, the check SHALL
`skip` or report that seals are absent without treating that as an error.

#### Scenario: Semantic drift surfaces in doctor JSON
- Given sealed anchors with at least one `changed-semantic` finding
- When `speclaw doctor --json` runs
- Then a drift-related check SHALL be present
- And its remedy SHALL mention `speclaw drift`

#### Scenario: Missing anchors are not an installation error
- Given a project with no `lawbook/anchors/` files
- When `speclaw doctor --json` runs
- Then the drift check SHALL NOT have status `error` solely because anchors are
  absent
