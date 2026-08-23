# Local content

Governs which speclaw-installed paths are committed source and which are local,
regenerable artifacts that git must ignore. speclaw's workflow content lives
under `ai-specs/` (skills, commands, rules, agent packs, and the `.speclaw.json`
manifest) and is reproducible from the package, so it is local — never
committed. Each configured agent's IDE directory (`.claude/`, `.cursor/`, …)
reaches that content through symlinks (`.claude/skills -> ../ai-specs/skills`).
This is applied identically by `speclaw init` and `speclaw update` (both run
`scaffold()`), and speclaw helps an already-installed project stop tracking
`ai-specs/` without ever modifying the git index itself.

speclaw does not decide whether the agent IDE directories are committed: those
may hold a user's own skills/commands, so their git-tracking is left to the
user.

### Requirement: speclaw's regenerable content is gitignored `req~ai-specs-gitignore~1`

`speclaw init` and `speclaw update` SHALL ensure the project's `.gitignore`
ignores `ai-specs/`. Because `ai-specs/` holds only content regenerable from the
package (skills, commands, rules, agent packs) plus the local `.speclaw.json`
manifest, that content is local and MUST NOT be committed. The `.gitignore` edit
SHALL be idempotent — re-running init or update MUST NOT add a duplicate entry.

Needs: impl, itest

#### Scenario: init ignores ai-specs
- Given a project being set up with `speclaw init`
- When init completes
- Then the project's `.gitignore` ignores `ai-specs/`

#### Scenario: update ignores ai-specs for an already-installed project
- Given a project scaffolded before this behavior existed, whose `.gitignore`
  does not yet ignore `ai-specs/`
- When the user runs `speclaw update`
- Then the project's `.gitignore` ignores `ai-specs/`

#### Scenario: the ignore entry is not duplicated on re-run
- Given a project whose `.gitignore` already ignores `ai-specs/`
- When the user runs `speclaw init` or `speclaw update` again
- Then no duplicate `ai-specs/` entry is added

### Requirement: The agent IDE directories are left committable `req~agent-ide-committable~1`

speclaw SHALL NOT add the agent IDE directories or their symlinked
subdirectories (e.g. `.claude/`, `.claude/skills`, `.cursor/commands`) to
`.gitignore`. Those directories may hold a user's own skills, commands, or
config, so whether they are committed is the user's decision — speclaw only
creates the symlinks into `ai-specs/` and leaves their git-tracking untouched.

Needs: impl, itest

#### Scenario: configuring an agent does not gitignore its IDE content
- Given a project where an agent (e.g. `claude`) is configured
- When init or update completes
- Then the project's `.gitignore` contains no entry for that agent's IDE
  directory or its symlinked subdirectories (e.g. `.claude/skills`)

#### Scenario: a user's own skill in the IDE directory stays committable
- Given a project where a user has added their own skill under an agent's IDE
  directory (e.g. `.claude/skills`)
- When init or update runs
- Then that content is not ignored by speclaw's `.gitignore` entries

### Requirement: A still-tracked ai-specs is surfaced for the user to untrack `req~ai-specs-untrack-hint~1`

Adding an entry to `.gitignore` does not untrack a directory git already tracks.
When `speclaw init` or `speclaw update` runs inside a git repository and
`ai-specs/` is still tracked by git, speclaw SHALL print the exact
`git rm -r --cached ai-specs` command for the user to run. speclaw MUST NOT
modify the git index itself.

Needs: impl, utest

#### Scenario: tracked ai-specs prints untrack instructions
- Given a git repository where `ai-specs/` is still tracked by git
- When the user runs `speclaw update`
- Then speclaw prints a `git rm -r --cached ai-specs` command
- And speclaw does not modify the git index

#### Scenario: nothing tracked means no instructions
- Given a git repository where `ai-specs/` is not tracked by git
- When the user runs `speclaw init` or `speclaw update`
- Then no untrack instructions are printed

#### Scenario: outside a git repository, no git command is attempted
- Given a project directory that is not a git repository
- When the user runs `speclaw init`
- Then speclaw does not attempt any git command and prints no untrack
  instructions
