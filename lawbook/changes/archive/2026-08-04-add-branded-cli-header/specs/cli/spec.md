# CLI

The command-line surface of `speclaw`: how the `speclaw <command>` entrypoint
parses argv, dispatches to a handler, presents branded output, and reports basic
program information. This delta governs the branded header rendered by
`src/cli/lib/ui.ts` and injected from `src/cli/index.ts` (the `dispatch`/`main`
entrypoint).

### Requirement: Present a branded header on interactive commands

The CLI SHALL print a single-line branded header before the output of its
interactive commands. The header SHALL identify the tool, its installed version
(as resolved by `pkgVersion()`), and the project tagline on one line, styled in
the brand palette. It SHALL be printed exactly once per invocation, ahead of the
command's own output, for the interactive commands `help`, `update`, `agent`,
`doctor`, `index`, `watch`, and `lawbook`. `init` is excluded because it already
opens with the fuller multi-line brand banner; adding the one-line header would
brand it twice.

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
query family (`explore`, `search`, `recall`, `impact`, `trace`), and for `mcp`;
and it SHALL be suppressed for any command whenever standard output is not a TTY
(pipes, redirection, CI).

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
