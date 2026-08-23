# CLI

The command-line surface of `speclaw`: how the `speclaw <command>` entrypoint
parses argv, dispatches to a handler, presents branded output, and reports basic
program information. This delta governs the branded header rendered by
`src/cli/lib/ui.ts` and injected from `src/cli/index.ts` (the `dispatch`/`main`
entrypoint), plus the `budget`, `doctor`, and `telemetry` command surfaces.

### Requirement: Present a branded header on interactive commands

The CLI SHALL print a single-line branded header before the output of its
interactive commands. The header SHALL identify the tool, its installed version
(as resolved by `pkgVersion()`), and the project tagline on one line, styled in
the brand palette. It SHALL be printed exactly once per invocation, ahead of the
command's own output, for the interactive commands `help`, `update`, `agent`,
`doctor` (human form only), `index`, `watch`, `lawbook`, `budget` (human table
form only), `telemetry`, and `drift` (human table form only). `init` is excluded
because it already opens with the fuller multi-line brand banner; adding the
one-line header would brand it twice.

#### Scenario: `help` shows the branded header
- Given `speclaw` is installed and run in an interactive terminal
- When a user runs `speclaw help`
- Then a single branded header line naming `speclaw`, the installed
  `package.json` version, and the tagline is printed before the usage text
- And the process exits with status `0`

#### Scenario: The header appears once, ahead of command output
- Given an interactive command that shows the header (e.g. `agent list`)
- When it runs in an interactive terminal
- Then exactly one header line is printed, before the command's own output

### Requirement: Never contaminate machine-consumed output

The header SHALL NOT be printed for commands whose output is consumed by scripts
or other programs, nor when standard output is not an interactive terminal. The
header SHALL be suppressed for `version` / `--version` / `-v`, for the Compass
query family (`explore`, `search`, `recall`, `impact`, `trace`,
`affected-tests`, `hotspots`, `coupling`), `quick`, machine-oriented
`lawbook level` output, `mcp`, `verify` (exit codes and SARIF/JSON are
machine-consumed), `budget --json`, `doctor --json`, `coverage` when emitting
TAP/JSON or when stdout is not a TTY, and `drift --json` or when drift stdout
is not a TTY; and it SHALL be suppressed for any command whenever standard
output is not a TTY (pipes, redirection, CI).

#### Scenario: `--version` stdout stays a bare version string
- Given `speclaw` is installed
- When `speclaw --version` output is captured (e.g. `v=$(speclaw --version)`)
- Then stdout contains only the bare installed version — no header line is mixed
  in — and the process exits `0`

#### Scenario: Query-command output carries no header
- Given the local code graph exists
- When a user runs a Compass query command (e.g. `speclaw search <query>`)
- Then its stdout contains only the query result, with no header line

#### Scenario: Piped output omits the header
- Given any header-eligible command (e.g. `speclaw help`)
- When its standard output is piped or redirected (not a TTY)
- Then no header line is emitted

#### Scenario: `budget --json` emits no header
- Given `speclaw` is installed
- When `speclaw budget --json` runs in an interactive terminal
- Then stdout SHALL be machine-readable JSON only, with no branded header

#### Scenario: `doctor --json` emits no header
- Given `speclaw` is installed
- When `speclaw doctor --json` runs in an interactive terminal
- Then stdout SHALL be machine-readable JSON only, with no branded header

### Requirement: Verify command is a first-class CLI entry

The CLI SHALL dispatch `speclaw verify` to the CI orchestrator. Help text SHALL
list `verify` alongside `check` and `laws verify`. `verify` SHALL NOT print the
branded header, even when stdout is a TTY.

#### Scenario: `help` lists verify
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `verify`

#### Scenario: `verify` emits no header
- Given `speclaw` is installed
- When `speclaw verify --ci` runs in a forced-interactive terminal
- Then stdout SHALL NOT contain the branded tagline

### Requirement: Budget command is a first-class CLI entry

The CLI SHALL dispatch `speclaw budget` to the context-budget reporter. Help
text SHALL list `budget`. Human-readable output SHALL print the per-surface
table; `--json` SHALL emit the structured measurement used by gates and scripts.

#### Scenario: `help` lists budget
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `budget`

#### Scenario: `budget` prints the surface table
- Given an initialised project
- When a user runs `speclaw budget` on a TTY
- Then stdout SHALL include per-surface token counts and the always-on total

### Requirement: Doctor command exposes structured diagnostics

The CLI SHALL dispatch `speclaw doctor` to the operational-trust diagnostic.
Help text SHALL list `doctor`. Human-readable output SHALL group checks by
section. `--json` SHALL emit the versioned `DoctorReport`. Flags `--offline`,
`--strict`, `--redact` (default), and `--no-redact` SHALL be accepted.

#### Scenario: `help` lists doctor
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `doctor`

#### Scenario: `doctor --json` prints only the report
- Given any project directory
- When a user runs `speclaw doctor --json`
- Then stdout SHALL parse as JSON with `schemaVersion` and `sections`
- And no branded header SHALL appear on stdout

### Requirement: Telemetry status is a first-class CLI entry

The CLI SHALL dispatch `speclaw telemetry` with a `status` subcommand (and SHALL
reject enable/disable as unavailable). Help text SHALL mention `telemetry`.

#### Scenario: `help` lists telemetry
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `telemetry`

#### Scenario: `telemetry status` runs without a header when piped
- Given `speclaw` is installed
- When `speclaw telemetry status` output is piped
- Then no branded header SHALL appear on stdout

### Requirement: Coverage command is a first-class CLI entry

The CLI SHALL dispatch `speclaw coverage` to the requirement-coverage reporter
(not the Compass call-path command `speclaw trace`). Help text SHALL list
`coverage`. Non-TTY / `--tap` SHALL emit TAP; `--json` SHALL emit the versioned
coverage report; TTY without those flags MAY emit a color table. Flags
`--adopt`, `--write`, `--strict`, `--only-defects`, `--tags`, `--requirement`
SHALL be accepted as specified by the `requirement-coverage` capability.

#### Scenario: `help` lists coverage and keeps trace as call-path
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `coverage`
- And `trace` SHALL remain documented as a call-path query between two symbols

#### Scenario: `coverage --json` prints only the report
- Given an initialised project
- When a user runs `speclaw coverage --json`
- Then stdout SHALL parse as JSON with a coverage summary
- And no branded header SHALL appear on stdout

#### Scenario: `coverage` does not register as `trace`
- Given `speclaw` is installed
- When a user runs `speclaw trace --help` or reads help for `trace`
- Then that help SHALL describe call-path tracing, not requirement coverage

### Requirement: Drift command is a first-class CLI entry

The CLI SHALL dispatch `speclaw drift` to the spec↔code drift reporter (not
the Compass call-path command `speclaw trace`). Help text SHALL list `drift`.
Human TTY output MAY print a summary table; `--json` SHALL emit the versioned
drift report with no branded header. Flags `--capability`, `--fail-on`,
`--reverse`, `--reseal`, `--explain`, and `--since` SHALL be accepted as
specified by the `spec-drift` capability. Default `--fail-on` SHALL be
`semantic` for interactive use.

#### Scenario: `help` lists drift
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `drift`

#### Scenario: `drift --json` prints only the report
- Given an initialised project
- When `speclaw drift --json` runs in an interactive terminal
- Then stdout SHALL parse as JSON with a drift summary
- And no branded header SHALL appear on stdout

### Requirement: Impact query prints grouped blast radius

The CLI SHALL dispatch `speclaw query impact` (and the short form `speclaw
impact` when that alias exists) to the Compass reverse-reachability reporter
specified by the `code-graph` capability. Default human output SHALL present
per-module counts and representatives, not a raw dump of every node. `--json`
SHALL emit the structured impact report (grouped by default; `format=flat`
when requested). The branded header SHALL NOT appear on impact stdout. Flags
for target symbol / `nodeId` / files / edge kinds / max depth / format SHALL be
accepted as needed to exercise the `code-graph` impact requirements.

#### Scenario: `help` documents impact
- Given `speclaw` is installed
- When a user runs `speclaw help` or `speclaw query --help`
- Then the usage text SHALL mention `impact`

#### Scenario: Impact stdout has no branded header
- Given a local code graph exists
- When a user runs `speclaw query impact <symbol>`
- Then stdout SHALL contain only the impact result, with no branded header

#### Scenario: Default impact output is summarised
- Given a symbol whose reverse closure spans multiple modules
- When a user runs `speclaw query impact <symbol>` without a flat-format flag
- Then human or JSON output SHALL expose module-level totals
- And SHALL NOT require the agent to consume every node by default

### Requirement: Affected-tests query selects a runnable command

The CLI SHALL dispatch `speclaw query affected-tests` to the static
affected-test selector specified by the `code-graph` capability. It SHALL
accept an explicit file/symbol list and `--from-diff <ref>` (seeded from git
changed files against that ref). Help text SHALL list `affected-tests`. Output
SHALL include the selected test paths (or `mode: "all"`) and an executable
`command` string. `--json` SHALL emit the structured selection report. The
branded header SHALL NOT appear on affected-tests stdout.

#### Scenario: `help` lists affected-tests
- Given `speclaw` is installed
- When a user runs `speclaw help` or `speclaw query --help`
- Then the usage text SHALL mention `affected-tests`

#### Scenario: Diff mode runs without a branded header
- Given a git repository with a merge-base against `main` and a local code graph
- When a user runs `speclaw query affected-tests --from-diff main`
- Then stdout SHALL contain the selection (human or `--json`) with no branded
  header
- And when `--json` is set, stdout SHALL parse as JSON naming selected tests
  and a `command`

#### Scenario: Explicit files produce a command
- Given an indexed project and one or more changed source files
- When a user runs `speclaw query affected-tests --file <path>`
- Then the result SHALL include a non-empty `command` when any tests are selected
  or when `mode` is `all`

### Requirement: Hotspots and coupling are first-class CLI entries

The CLI SHALL dispatch `speclaw hotspots` and `speclaw coupling <file>` (and
MAY accept them under a `query` family) to the reporters specified by the
`code-graph` capability. Help text SHALL list both. Human output MAY print a
summary table; `--json` SHALL emit the structured reports. The branded header
SHALL NOT appear on either command's stdout. Flags for window/`since`,
`sortBy`, `limit`, and coupling thresholds SHALL be accepted as needed to
exercise the `code-graph` hotspots and coupling requirements.

#### Scenario: `help` lists hotspots and coupling
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `hotspots`
- And SHALL mention `coupling`

#### Scenario: Hotspots stdout has no branded header
- Given a git repository and a local code graph
- When a user runs `speclaw hotspots`
- Then stdout SHALL contain only the hotspots result, with no branded header

#### Scenario: Coupling JSON parses without a header
- Given an indexed git repository containing `src/a.ts`
- When a user runs `speclaw coupling src/a.ts --json`
- Then stdout SHALL parse as JSON naming coupling partners or an empty list
- And no branded header SHALL appear on stdout

### Requirement: Quick and level are first-class CLI entries

The CLI SHALL dispatch `speclaw quick <name>` to scaffold a level-0 change
(`record.md`, `change.json`, `reports/`) and SHALL expose ceremony level
inspection/update under the lawbook command family (for example
`speclaw lawbook level`). Help text SHALL list `quick`. Human output MAY print
a short summary; `--json` SHALL emit structured results. The branded header
SHALL NOT appear on `quick --json` or machine-oriented level JSON stdout.

#### Scenario: `help` lists quick
- Given `speclaw` is installed
- When a user runs `speclaw help`
- Then the usage text SHALL mention `quick`

#### Scenario: Quick JSON has no branded header
- Given an initialised project
- When a user runs `speclaw quick fix-typo --json`
- Then stdout SHALL parse as JSON describing the level-0 change
- And no branded header SHALL appear on stdout

### Requirement: Bug draft is a first-class CLI entry

The CLI SHALL accept `speclaw lawbook draft --bug <name>` (and equivalent MCP
`lawbook draft` with a bug flag) to scaffold a bug change with `bugfix.md`
instead of feature artifacts. Help text SHALL document the flag. Machine-oriented
output (`--json`) SHALL emit structured scaffold metadata with no branded
header.

#### Scenario: Help documents draft --bug
- Given `speclaw` is installed
- When a user runs `speclaw lawbook --help` or reads draft help
- Then the usage text SHALL mention `--bug`

#### Scenario: Bug draft JSON has no branded header
- Given an initialised project
- When a user runs `speclaw lawbook draft --bug dup-charge --json`
- Then stdout SHALL parse as JSON naming `bugfix.md` and change type `bug`
- And no branded header SHALL appear on stdout

### Requirement: Investigate is a first-class CLI entry

The CLI SHALL dispatch `speclaw lawbook investigate` to the deterministic bug
investigation reporter (stack trace and/or prose symptom). Help text SHALL list
the subcommand. `--json` SHALL emit the structured `InvestigateResult`. The
branded header SHALL NOT appear on investigate stdout.

#### Scenario: Help lists investigate
- Given `speclaw` is installed
- When a user runs `speclaw lawbook --help`
- Then the usage text SHALL mention `investigate`

#### Scenario: Investigate JSON parses without a header
- Given an indexed project
- When a user runs `speclaw lawbook investigate --symptom "duplicate charge" --json`
- Then stdout SHALL parse as JSON with a `suspects` array
- And no branded header SHALL appear on stdout

### Requirement: Render safely across Linux and Windows terminals

The header SHALL render correctly on both Linux and Windows terminals. When the
terminal reliably supports unicode, the header MAY use unicode glyphs; when it
does not (e.g. a legacy Windows console without unicode support), the header
SHALL substitute ASCII equivalents rather than emit unrenderable glyphs. When
color is disabled (`NO_COLOR` set or output is not a TTY), the header text SHALL
still be legible as plain text.

#### Scenario: Unicode-capable terminal uses unicode glyphs
- Given a terminal that reliably supports unicode
- When a header-eligible command runs interactively
- Then the header renders with its unicode brand glyphs

#### Scenario: Legacy console falls back to ASCII
- Given a terminal that does not reliably support unicode
- When a header-eligible command runs interactively
- Then the header renders with ASCII substitutes and no unrenderable glyphs

### Requirement: Diff context CLI entry

The CLI SHALL dispatch a query subcommand (e.g. `speclaw query diff-context` or
`speclaw diff-context`) to the same diff-context reporter as the MCP tool.
Machine output SHALL omit the branded header.

#### Scenario: Help documents diff context
- Given `speclaw` is installed
- When a user runs `speclaw help` or `speclaw query --help`
- Then the usage text SHALL mention diff-context (or equivalent name)

### Requirement: Scaffold is CLI-only

The `scaffold` capability SHALL remain available through the CLI and init/update
flows but SHALL NOT register as an MCP tool after this change.

#### Scenario: MCP tool list excludes scaffold
- Given the MCP server in full profile
- When the tool list is requested
- Then `scaffold` SHALL NOT appear

### Requirement: Doctor and law verify stay CLI-first

Structured `doctor` diagnostics and `speclaw laws verify` SHALL remain available
via CLI. They SHALL NOT count toward the eight canonical MCP tools.

#### Scenario: MCP tool list excludes doctor
- Given the MCP server in full profile
- When the tool list is requested
- Then `doctor` SHALL NOT appear as a registered MCP tool
