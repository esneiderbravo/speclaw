# CLI

The command-line surface of `speclaw`: how the `speclaw <command>` entrypoint
parses argv, dispatches to a handler, and reports basic program information.
Governs `src/cli/index.ts` (the `dispatch`/`main` entrypoint),
`src/cli/commands/version.ts`, and the update-notice helpers in
`src/cli/lib/update-check.ts`.

### Requirement: Report the installed version

The CLI SHALL report its own locally installed version. Invoking `speclaw` with
any of `version`, `--version`, or `-v` SHALL print the version string from the
package's own `package.json` (as resolved by `pkgVersion()`) to **stdout** and
exit with status `0`. The output SHALL be the bare version string with no
additional decoration, so it is safe to consume from scripts and pipes.

#### Scenario: `--version` prints the installed version and exits zero
- Given `speclaw` is installed
- When a user runs `speclaw --version`
- Then the locally installed `package.json` version is printed to stdout on its
  own line
- And the process exits with status `0`

#### Scenario: The version aliases are equivalent
- Given `speclaw` is installed
- When a user runs `speclaw version` or `speclaw -v`
- Then each prints the same installed version string to stdout and exits `0`,
  identically to `speclaw --version`

#### Scenario: The version command is not treated as unknown
- Given the CLI dispatch
- When any version alias is invoked
- Then it is handled as a recognized command — it does NOT print
  `Unknown command`, does NOT dump the HELP text, and does NOT exit non-zero

#### Scenario: The command is documented in help
- Given the `speclaw help` output
- When a user reads it
- Then a `--version` entry appears under the "Other" section

### Requirement: Suggest an upgrade when a newer version is published

When run interactively, the version command SHALL check npm for the latest
published version and, when it is newer than the installed one, additionally
report the newer version and a suggestion to upgrade. The suggestion SHALL
render the newer version as a clickable terminal hyperlink (OSC 8) to the
package's npm page, alongside the `speclaw update` command that performs the
upgrade. This upgrade suggestion SHALL be written to **stderr** so the stdout
version line stays a single clean, scriptable value.

The check SHALL be best-effort and non-blocking to scripting: it SHALL be
skipped when stderr is not an interactive TTY or when
`NO_UPDATE_NOTIFIER` / `SPECLAW_NO_UPDATE_NOTIFIER` is set, and any registry
failure (offline, timeout, error) SHALL be swallowed so the command still prints
the installed version and exits `0`.

#### Scenario: A newer published version is offered with a clickable upgrade link
- Given the installed version is older than the latest published on npm
- And the command runs in an interactive terminal
- When a user runs `speclaw --version`
- Then the installed version is printed to stdout
- And a suggestion is printed to stderr showing the newer version as a clickable
  link to the package's npm page, together with the `speclaw update` command

#### Scenario: stdout stays a clean version string for scripts
- Given any environment
- When `speclaw --version` output is captured (e.g. `v=$(speclaw --version)`)
- Then stdout contains only the bare installed version — the upgrade suggestion,
  if any, is on stderr and never mixed into stdout

#### Scenario: No suggestion in non-interactive or opted-out runs
- Given stderr is not a TTY, or `NO_UPDATE_NOTIFIER` / `SPECLAW_NO_UPDATE_NOTIFIER`
  is set
- When `speclaw --version` runs
- Then no registry lookup is performed and only the installed version is emitted

#### Scenario: A registry failure never breaks the command
- Given the npm registry is unreachable or returns an error
- When `speclaw --version` runs interactively
- Then the failure is swallowed, the installed version is still printed to
  stdout, and the process exits `0`
