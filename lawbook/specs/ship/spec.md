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

WHEN an edit or a Bash call changes the branch's file set and its measurement shows level 1 or more, the system SHALL create the change and return the artifacts its level owes as additional context, once per change and level.

#### Scenario: The hint arrives before the stop
- Given a branch whose edits grow to five modules and whose diff was measured
- When the `PostToolUse` hook runs after the edit
- Then the agent receives the level and the owed `tasks.md`, and a second edit of the same files adds no hint

### Requirement: The edit hook never waits on a measurement

WHEN the branch's file set has no cached measurement, the system SHALL start `speclaw measure-diff` as a detached background process and return without a hint.

#### Scenario: A slow diff does not stall the hook
- Given a feature branch whose new file set was never measured
- When the documentation hook runs
- Then it returns at once without a hint, and the background job writes `.speclaw/level-cache.json`

#### Scenario: The hint follows the measurement
- Given the background job finished measuring the file set
- When the next hook call runs
- Then it returns the hint for the measured level

### Requirement: One measurement per file set

WHEN the cached measurement matches the branch's current file set, the system SHALL reuse it instead of measuring again.

#### Scenario: The stop reuses the edit hook's measurement
- Given the level cache holds a measurement of the current file set
- When ship runs at the stop
- Then the change takes the cached level without a new measurement

### Requirement: A level counts as told only when its hint is returned

WHEN the documentation hook returns no hint, the system SHALL leave the told change and level unchanged.

#### Scenario: A queued measurement tells nothing
- Given the hook started a background measurement and returned no hint
- When the measurement finishes and the next call runs
- Then that call still returns the hint

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

### Requirement: A regenerated Compass map is not work

WHEN `docs/compass.md` differs from the merge base only inside its generated map block, the system SHALL leave it out of the branch's changed files and of the work fingerprint.

#### Scenario: A session start on a fresh branch ships nothing
- Given a fresh feature branch where a re-index rewrote only the map block of `docs/compass.md`
- When the Stop hook runs
- Then it skips with `no-changes` and creates no change

#### Scenario: A re-index on a branch with work does not reship
- Given a branch whose work was shipped
- When a re-index rewrites only the map block
- Then the Stop hook skips with `unchanged-since-last-ship`

#### Scenario: An edit outside the block is work
- Given an edit to `docs/compass.md` outside the map block
- When the Stop hook runs
- Then it ships the change

### Requirement: A small fix stays level 0

WHEN the branch diff changes at most one source file by at most ten lines (test and doc files aside) and touches no public API or global file, the system SHALL measure it at level 0 whatever its blast radius.

#### Scenario: A one-line fix in a central function
- Given a function called from twelve modules and four tests
- When a branch changes one line of it and adds a regression test
- Then ship confirms level 0 and archives the change after passing gates

#### Scenario: The same file past the small-fix size
- Given the same central file
- When a branch changes fifteen lines of it
- Then ship measures level 1 or more

### Requirement: The stop runs the tests the diff reaches

WHEN ship runs the project's whole-suite test gate (`npm test`, `npm run test`, or the pnpm/yarn equivalent), the system SHALL run only the test files the diff reaches and record that scope in the report, unless `ship.tests` is `full`.

#### Scenario: A central fix runs its affected tests
- Given an indexed project whose test gate is `npm test`
- When ship runs for a one-line fix
- Then the test gate runs a command naming the affected test files and the report says the full suite runs in CI

#### Scenario: The project asks for the full suite
- Given `ship.tests: full` in `lawbook/config.yaml`
- When ship runs
- Then the test gate runs `npm test`

### Requirement: The full suite when the selection cannot be trusted

WHEN there is no Compass index, a global file changed, or no test reaches changed code, the system SHALL run the whole-suite test gate.

#### Scenario: No index
- Given a project without a Compass index
- When ship runs its `npm test` gate
- Then the gate runs `npm test` and the report names why
