# ship

The fast path for finished work: `speclaw ship <change>` and the Claude Code
`Stop` hook (`speclaw ship-on-stop`).

### Requirement: Diff-measured ceremony level

WHEN ship creates a change, the system SHALL propose its ceremony level from the branch's changed files and record it as confirmed by `measured`.

#### Scenario: A multi-module diff is not level 0
- Given a branch that changes files in five modules
- When ship runs for a new change
- Then the change's `change.json` records `confirmedBy` `measured` and a level of 1 or more

#### Scenario: A release bump does not raise the level
- Given a branch whose only change is the `version` field of `package.json`
- When ship runs
- Then the change is confirmed at level 0

### Requirement: Measured level follows the diff

WHEN the branch diff measures above a change's `measured` level, the system SHALL raise the change to the measured level.

#### Scenario: A human-set level stands
- Given a change whose level a human confirmed
- When the branch diff measures higher
- Then the level is unchanged

### Requirement: Outgrown archive reopens

WHEN a `measured` change archived on the branch is outgrown by the diff and its archive is absent at the merge base, the system SHALL move the change back under `lawbook/changes/` before raising its level.

#### Scenario: An outgrown level-0 archive reopens
- Given a change archived at level 0 on this branch
- When the branch grows to five modules and the hook runs
- Then the change is back under `lawbook/changes/` at level 1 or more and its finished harness is removed

#### Scenario: A merged archive stays sealed
- Given a change archive that exists at the merge base
- When a later branch reuses the change name with a larger diff
- Then the archive stays in place and only its report is refreshed

### Requirement: Artifacts before gates

WHEN a change at level 1 or more lacks an artifact its level requires or holds a scaffold stub, the system SHALL return the list of owed artifacts instead of running any gate.

#### Scenario: Owed artifacts stop the gates
- Given a new level-2 change with scaffold stubs
- When ship runs with a failing gate configured
- Then no gate runs, no report is written, and the result lists `proposal.md`, `tasks.md` and the delta spec

#### Scenario: Written artifacts let the gates run once
- Given the owed artifacts are written
- When ship runs again
- Then the gates run once and a level 1+ change waits for review on the PR

### Requirement: Documentation named while editing

WHEN an edit or a Bash call changes the branch's file set and the diff measures level 1 or more, the system SHALL create the change and return the artifacts its level owes as additional context, once per change and level.

#### Scenario: The hint arrives before the stop
- Given a branch whose edits grow to five modules
- When the `PostToolUse` hook runs after the edit
- Then the agent receives the level and the owed `tasks.md`, and a second edit of the same files adds no hint

#### Scenario: Written in the same turn, the stop is not blocked
- Given the agent wrote what the hint named
- When the `Stop` hook ships
- Then nothing is pending and the gates run once

### Requirement: Level 0 never waits

WHEN a change is level 0, the system SHALL fill its record from the branch's commit bodies without trailers, or from the changed-file list when there are none, without waiting on any owed artifact.

#### Scenario: Commit bodies are the why
- Given a branch commit with a body and a `Co-Authored-By` trailer
- When the hook ships the level-0 change
- Then the archived record contains the subject and body and no trailer

### Requirement: Hotspots need churn

WHEN measuring hotspot pressure, the system SHALL count only files with 3 or more commits in the hotspot window.

#### Scenario: A young repo has no hotspot
- Given a repository with a single commit
- When the level is measured for one of its files
- Then the hotspot score is 0
