# Project update

How `speclaw update` delivers a release's changes to an already-scaffolded
project, split by file ownership, and how the tool addresses the user's agent.
This supersedes the canonical `project-update` spec, changing the managed-file
backup from always-on to opt-in. `speclaw update` re-executes itself at the
latest published version before migrating, and init/update pin the agent MCP
entry to the exact installed version.

### Requirement: Update refreshes managed files automatically

`speclaw update` SHALL overwrite the project's managed files (speclaw's workflow
machinery: the skills, commands, rules, and agent packs under `ai-specs/`) with
the current package version, so that improvements to those files reach projects
that already have speclaw. A file that does not yet exist SHALL be created.

#### Scenario: An outdated managed file is refreshed
- Given a project whose `ai-specs/skills/` files are from an older speclaw version
- When the user runs `speclaw update`
- Then those managed files are overwritten with the current version
- And the update reports which managed files it refreshed

#### Scenario: An up-to-date managed file needs no change
- Given a project whose managed files already match the current version
- When the user runs `speclaw update`
- Then no managed files are rewritten and none are reported as changed

### Requirement: A locally edited managed file is refreshed and reported; backup is opt-in

When a managed file has diverged from the version speclaw last wrote (detected
via the baseline hash recorded in the manifest, or absent baseline), `speclaw
update` SHALL, by default, overwrite it and SHALL report that the file had local
edits and was refreshed, so the user can recover the prior content from version
control. It MUST NOT overwrite a diverged managed file silently.

When the user passes `--backup`, `speclaw update` SHALL copy the diverged file
to `<file>.bak` before overwriting it and SHALL report the backup.

`speclaw update` SHALL ensure the project's `.gitignore` ignores `*.bak`, so a
backup is never committed.

#### Scenario: A diverged managed file is refreshed and reported (default)
- Given a managed file the user edited after it was scaffolded
- When the user runs `speclaw update` without `--backup` and that file is refreshed
- Then the file is overwritten with the current version
- And the update reports that the file had local edits and was refreshed
- And no `<file>.bak` is created

#### Scenario: A diverged managed file is backed up on request
- Given a managed file the user edited after it was scaffolded
- When the user runs `speclaw update --backup` and that file is refreshed
- Then the user's version is saved as `<file>.bak`
- And the new version is written and the backup is reported

#### Scenario: Backups are gitignored
- Given a project brought up to date with `speclaw update`
- When the update completes
- Then the project's `.gitignore` ignores `*.bak`

### Requirement: Update does not auto-edit personalized files

`speclaw update` SHALL NOT overwrite personalized files — those filled with
project specifics at init (`CLAUDE.md`, `AGENTS.md`, `LAWS.md`,
`docs/standards/*`, `docs/compass.md`, `lawbook/config.yaml`). Instead, when a
crossed release changed the speclaw-authored content of those files, it SHALL
print a prompt that describes the changes to apply, for the user to run with
their agent while preserving project-specific content.

#### Scenario: Personalized changes are delivered as an agent prompt
- Given a release that changed personalized-file content (e.g. a new rule)
- And a project on an older version
- When the user runs `speclaw update`
- Then no personalized file is auto-edited
- And a prompt describing the changes to apply is printed for the user's agent

#### Scenario: No personalized changes means no prompt
- Given a release with no personalized-file changes since the project's version
- When the user runs `speclaw update`
- Then no personalized-file prompt is printed

#### Scenario: A project on the previously shipped version still gets the prompt
- Given a release that first introduces a personalized-file change and its update
  prompt
- And a project whose recorded version is the immediately preceding released
  version
- When the user runs `speclaw update`
- Then the personalized-file prompt is printed
- (The prompt SHALL be gated at the version that introduces it, so the cohort on
  the prior release is not skipped by a strict version comparison.)

### Requirement: Update applies every migration crossed since the project's version

`speclaw update` upgrades directly to the latest version, so it SHALL apply every
migration whose version is newer than the project's recorded version — not only
the most recent — oldest first, and include each crossed release's
personalized-file prompt. Shipped migration entries are cumulative and MUST NOT
be removed, so a project that updates across several releases at once loses none.

#### Scenario: A project several releases behind loses no migration
- Given a project whose recorded version is several releases behind the latest
- And releases in between each added a migration
- When the user runs `speclaw update`
- Then every one of those migrations is applied, oldest first
- And each crossed release's personalized prompt is included

### Requirement: Update re-executes itself at the latest version `req~update-self-update~1`

WHEN `speclaw update` runs without `--check` and the npm registry, queried
during that run, reports a published version newer than the running one, the
system SHALL spawn `npx -y @esneiderbravo/speclaw@<latest> update` with the
forwarded flags of the original invocation, inherited stdio, and the
environment variable `SPECLAW_SELF_UPDATED` set to `<latest>`, SHALL NOT apply
project migrations in the parent process, and SHALL exit with the child's exit
code (code 1 when the child ends by a signal). The re-execution SHALL happen
whether or not the terminal is interactive, including in CI. The system SHALL
NOT re-execute WHEN `--no-self-update` is passed, `SPECLAW_NO_SELF_UPDATE` is
set to a non-empty value, `SPECLAW_SELF_UPDATED` is already set, or the latest
version came only from the offline cache; in those cases it SHALL print the
binary upgrade hint and apply project migrations with the running binary. IF
the `npx` executable cannot be spawned, THEN the system SHALL warn with the
reason, print the binary upgrade hint, and apply project migrations in process.
The system SHALL forward only argument tokens that match the safe flag pattern
`^--?[A-Za-z][A-Za-z0-9-]*(=[A-Za-z0-9._/:@-]*)?$` and SHALL name every dropped
token in a warning; on Windows it SHALL spawn `npx.cmd` through the shell. The
process spawn SHALL live outside `src/cli/commands/update.ts` and SHALL be
injectable through `UpdateHooks`. `speclaw init` SHALL keep printing an
advisory when a newer version exists and SHALL NOT re-execute. WHEN updating
across the release that introduces self-update, `speclaw update` SHALL surface a
migration note that mentions self-update and `--no-self-update`, and the
shipped migration entries of earlier releases SHALL remain unchanged.

Needs: impl, utest
Status: approved

#### Scenario: A newer registry version re-executes update and skips local migration
- Given the running version is older than the version the registry reports in
  this run
- When the user runs `speclaw update --backup`
- Then `npx` SHALL be spawned with `-y @esneiderbravo/speclaw@<latest> update --backup`
- And the child environment SHALL carry `SPECLAW_SELF_UPDATED=<latest>`
- And the parent SHALL NOT apply project migrations
- And the process exit code SHALL equal the child's exit code

#### Scenario: A failing child propagates its exit code
- Given a re-executed child that exits with code 3
- When `speclaw update` finishes
- Then the process exit code SHALL be 3
- And the parent SHALL NOT apply project migrations

#### Scenario: Opt-outs and the loop guard migrate in process
- Given a newer registry version
- When `speclaw update` runs with `--no-self-update`, or with
  `SPECLAW_NO_SELF_UPDATE=1`, or with `SPECLAW_SELF_UPDATED` already set
- Then no process SHALL be spawned
- And project migrations SHALL be applied with the running binary
- And the binary upgrade hint SHALL be printed

#### Scenario: An offline cached latest does not re-execute
- Given the registry is unreachable and the cache holds a newer `latest`
- When the user runs `speclaw update`
- Then no process SHALL be spawned
- And project migrations SHALL be applied with the running binary

#### Scenario: A missing npx falls back to in-process migration
- Given a newer registry version and an `npx` executable that cannot be spawned
- When the user runs `speclaw update`
- Then a warning SHALL name the spawn failure
- And project migrations SHALL be applied with the running binary

#### Scenario: Check mode never re-executes
- Given a newer registry version
- When the user runs `speclaw update --check`
- Then no process SHALL be spawned and no migration SHALL be applied

#### Scenario: Unsafe argument tokens are dropped
- Given an invocation `speclaw update --backup "x;rm -rf ~"`
- When the forwarded arguments are computed
- Then they SHALL be `--backup` only
- And a warning SHALL name the dropped token

#### Scenario: The update module never imports child_process
- Given the source of `src/cli/commands/update.ts`
- When it is inspected
- Then it SHALL NOT import `child_process` or call `spawnSync`

#### Scenario: Crossing the self-update release surfaces a note
- Given a project whose recorded speclaw version is older than the self-update
  release
- When the user runs `speclaw update --no-self-update`
- Then the printed migration notes SHALL mention self-update or
  `--no-self-update`

### Requirement: Init and update pin the MCP entry to the installed version `req~mcp-entry-pinned~1`

WHEN `speclaw init`, `speclaw agent add`, or `speclaw update` writes an agent MCP
config that has no `speclaw` server entry, the system SHALL write the entry
`{ "type": "stdio", "command": "npx", "args": ["-y",
"@esneiderbravo/speclaw@<version>", "mcp"] }`, where `<version>` is the running
package version. WHEN that config already holds a `speclaw` entry whose
`command` is `npx` and whose `args` are `-y`, `@esneiderbravo/speclaw` with or
without an `@<version>` suffix, and `mcp`, with no other keys than `type`,
`command`, and `args`, the system SHALL rewrite it to the pinned entry when it
differs and SHALL report the rewrite. IF the existing `speclaw` entry has any
other shape, THEN the system SHALL leave it unchanged and SHALL report it as a
kept custom entry. The MCP config file SHALL remain gitignored.

Needs: impl, utest
Status: approved

#### Scenario: A fresh config is pinned
- Given a project with no `.mcp.json`
- When `speclaw init` configures Claude Code
- Then the `speclaw` entry args SHALL be
  `["-y", "@esneiderbravo/speclaw@<pkgVersion>", "mcp"]`

#### Scenario: A stock unpinned entry is re-pinned on update
- Given a `.mcp.json` whose `speclaw` entry args are
  `["-y", "@esneiderbravo/speclaw", "mcp"]`
- When the user runs `speclaw update`
- Then the entry args SHALL carry `@esneiderbravo/speclaw@<pkgVersion>`
- And the update SHALL report the rewrite

#### Scenario: An entry pinned to an older version is re-pinned
- Given a `speclaw` entry pinned to `@esneiderbravo/speclaw@2.0.1`
- When `speclaw update` runs with the installed version 2.0.9
- Then the entry SHALL be pinned to `2.0.9`

#### Scenario: A custom entry is kept
- Given a `speclaw` entry whose `command` is `node` with a local path argument
- When the user runs `speclaw update`
- Then the entry SHALL be unchanged
- And the update SHALL report it as a kept custom entry

### Requirement: Agent handoff language is agent-generic

The `init` handoff and the `update` prompt SHALL address "the agent you're
using" rather than naming a specific agent product. Agent names MAY still appear
where the user selects among real agents.

#### Scenario: Init handoff does not hardcode a single agent
- Given a user completing `speclaw init`
- When the handoff prompt is printed
- Then it instructs the user to paste it into the agent they use, not a
  hardcoded product name

### Requirement: Init and update write no CI workflow

`speclaw init` and `speclaw update` SHALL NOT write
`.github/workflows/speclaw.yml` or any other CI file. A workflow the user
already has SHALL be left unchanged.

#### Scenario: A fresh project receives no CI file
- Given a project with no `.github/` folder
- When the user runs `speclaw init`
- Then no `.github/` folder is created

#### Scenario: An existing workflow is kept
- Given a project whose `.github/workflows/speclaw.yml` was written earlier
- When the user runs `speclaw update`
- Then the file is left unchanged

### Requirement: Init keeps tool config out of version control

`speclaw init` SHALL add to `.gitignore` the tool state it creates and
regenerates: `.speclaw/`, `ai-specs/`, `speclaw.lock`, and every agent folder
it creates (by default `.agents/`). An agent folder that existed before speclaw
configured it SHALL NOT be added.

#### Scenario: Default init ignores its own config
- Given a fresh git repository
- When the user runs `speclaw init`
- Then `.gitignore` lists `.speclaw/`, `ai-specs/`, `speclaw.lock`, and `.agents/`
- And only the project's content (`LAWS.md`, `CLAUDE.md`, `AGENTS.md`,
  `docs/`, `lawbook/`) remains to be committed

### Requirement: Update notes adaptive ceremony

When updating across the release that introduces adaptive ceremony, `speclaw
update` SHALL include a migration / agent prompt that mentions ceremony levels
0–3, `speclaw quick`, `change.json`, and that published laws describe
level-based artifact requirements.

#### Scenario: Crossing the adaptive-ceremony release surfaces a prompt
- Given a project whose recorded speclaw version is older than the adaptive
  ceremony release
- When the user runs `speclaw update`
- Then the personalized agent prompt SHALL mention ceremony levels or `quick`

### Requirement: Update notes bugfix specs

When updating across the release that introduces bugfix specs, `speclaw update`
SHALL include a migration / agent prompt that mentions `draft --bug`,
`bugfix.md`, `lawbook_investigate`, and the bug-specific archive gates
(reproduction, regression test, prevention).

#### Scenario: Crossing the bugfix-specs release surfaces a prompt
- Given a project whose recorded speclaw version is older than the bugfix-specs
  release
- When the user runs `speclaw update`
- Then the personalized agent prompt SHALL mention bug changes or `draft --bug`

### Requirement: Update notes consolidated MCP tool surface

When updating across the release that consolidates the MCP tool surface,
`speclaw update` SHALL include a migration / agent prompt that lists retired
MCP tool names and their replacements, mentions `SPECLAW_NO_ALIASES=1`, and
states that `scaffold` and `doctor` are CLI-only. Managed skills and commands
SHALL be refreshed to use canonical tool names.

#### Scenario: Crossing the tool-surface release surfaces a prompt
- Given a project whose recorded speclaw version is older than the tool-surface
  release
- When the user runs `speclaw update`
- Then the personalized agent prompt SHALL mention consolidated MCP tools or
  alias deprecation

#### Scenario: Managed assets use canonical tool names after update
- Given a project updated across the tool-surface release
- When managed command and skill files are inspected
- Then they SHALL reference canonical names such as `compass_explore` and
  `lawbook_change` rather than retired names like `compass_impact`

### Requirement: Init and update refresh speclaw.lock `req~lock-refresh-update~1`

WHEN `speclaw init` or `speclaw update` writes or regenerates tracked rule
artifacts, the system SHALL create or refresh `speclaw.lock` so digests match
the files just written, except that a strict path that had drifted from the
lock before the run SHALL keep its locked digest and SHALL be warned about, as
the `law-enforcement` requirement `req~lock-preserves-drift~1` specifies. WHEN
updating across the law-integrity release, update SHALL surface a migration
note about `speclaw.lock` and `laws accept`.

Needs: impl, utest
Status: approved

#### Scenario: Init creates a lockfile
- Given a new project scaffold
- When init completes after writing rule files
- Then `speclaw.lock` SHALL exist at the repository root

#### Scenario: Update notes the integrity release
- Given a project whose recorded speclaw version is older than the
  law-integrity release
- When the user runs `speclaw update`
- Then the personalized agent prompt SHALL mention `speclaw.lock` or
  `laws accept`

#### Scenario: Update does not re-baseline a drifted strict file
- Given a scaffolded project with `speclaw.lock`
- And `CLAUDE.md` modified outside the speclaw pipeline
- When the user runs `speclaw update --no-self-update`
- Then the `CLAUDE.md` digest in `speclaw.lock` SHALL be unchanged
- And the output SHALL name `speclaw laws accept CLAUDE.md`

### Requirement: Init and update refresh the CODEOWNERS owners block `req~owners-refresh-update~1`

WHEN `speclaw init` or `speclaw update` runs on a project that declares
`team.owners`, the system SHALL create or refresh the managed speclaw owners
block in `.github/CODEOWNERS` so it matches the declared map, preserving
user content outside the markers. WHEN updating across the release that
introduces spec ownership, update SHALL surface a migration note or agent
prompt mentioning `team.owners` and `speclaw owners --write`. IF `team.owners`
is absent, THEN init/update SHALL NOT invent an owners block.

Needs: impl, utest
Status: proposed

#### Scenario: Update refreshes an existing owners block
- Given a project with `team.owners` and a stale speclaw owners block
- When the user runs `speclaw update`
- Then the speclaw owners block SHALL match the current `team.owners` map
- And user patterns outside the markers SHALL remain

#### Scenario: Update notes the owners release
- Given a project whose recorded speclaw version is older than the
  spec-owners release
- When the user runs `speclaw update`
- Then the personalized agent prompt SHALL mention `team.owners` or
  `speclaw owners`
