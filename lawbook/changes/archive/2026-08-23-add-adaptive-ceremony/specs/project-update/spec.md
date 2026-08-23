# Project update

How `speclaw update` delivers a release's changes to an already-scaffolded
project, split by file ownership, and how the tool addresses the user's agent.
This supersedes the canonical `project-update` spec, changing the managed-file
backup from always-on to opt-in.

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

### Requirement: Agent handoff language is agent-generic

The `init` handoff and the `update` prompt SHALL address "the agent you're
using" rather than naming a specific agent product. Agent names MAY still appear
where the user selects among real agents.

#### Scenario: Init handoff does not hardcode a single agent
- Given a user completing `speclaw init`
- When the handoff prompt is printed
- Then it instructs the user to paste it into the agent they use, not a
  hardcoded product name

### Requirement: Update installs the verify workflow when missing

`speclaw update` (and `init`) SHALL write `.github/workflows/speclaw.yml` from
the shipped template when that path does not exist, and SHALL NOT overwrite it
when it does. The file is not a managed tree: local CI is owned by the user.

#### Scenario: A project without the workflow receives it on update
- Given a scaffolded project with no `.github/workflows/speclaw.yml`
- When the user runs `speclaw update`
- Then the workflow file is created from the current template

#### Scenario: A project that already has the workflow keeps it
- Given a project whose `.github/workflows/speclaw.yml` was edited by the user
- When the user runs `speclaw update`
- Then the file is left unchanged

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
