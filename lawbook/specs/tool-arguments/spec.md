# tool-arguments

How speclaw's MCP tools read the arguments agents send: what they infer when an
argument is left out or misnamed, so a call succeeds the first time instead of
costing the agent a retry.

### Requirement: Archive date defaults to today

WHEN `lawbook_change` action `archive` (or the `lawbook_archive` alias) is called without `date`, the system SHALL archive under today's date.

#### Scenario: Archive without a date
- Given a change that is ready to archive
- When `archive` is called with no `date`
- Then the change moves to `lawbook/changes/archive/<today>-<change>/`

### Requirement: Archive syncs an unsynced delta itself

WHEN a change carries delta specs that differ from the canonical specs, `archive` and level-0 `ship` SHALL promote them as part of archiving instead of refusing with "run sync first".

#### Scenario: Unsynced delta
- Given a ready change whose delta spec was never synced
- When `archive` is called
- Then the change is archived and the canonical spec equals the delta

### Requirement: The target change is inferred

WHEN `validate`, `sync`, `archive`, `ship`, `level` in mode `set` or `promote`, or `harness` is called without `change`, the system SHALL use `name` if given, else the only active change, else the active change the current branch ships.

#### Scenario: The branch picks the change
- Given active changes `default-cost-center` and `unrelated` on branch `feat/FAR-1360-default-cost-center`
- When `level` mode `set` is called without `change`
- Then the level is set on `default-cost-center` only

### Requirement: No guess when no change fits

WHEN no change can be inferred, the system SHALL fail with an error that lists the active changes.

#### Scenario: Nothing fits
- Given two active changes and a branch that matches neither
- When `sync` is called without `change`
- Then the call fails and the error lists both active changes

### Requirement: Misnamed arguments are read as meant

The system SHALL read action `create` or `new` as `draft`, and a comma- or newline-separated `paths` or `symbols` string as the list.

#### Scenario: Create drafts
- Given an initialized lawbook
- When `lawbook_change` is called with action `create` and `name` `add-widget`
- Then the change `add-widget` is drafted

### Requirement: Explore answers a phrase as a find

WHEN `compass_explore` receives `query` and no `node`, the system SHALL return the ranked matches `compass_find` gives for that query.

#### Scenario: A search phrase
- Given an indexed project defining `visibleTo`
- When `compass_explore` is called with `query` "visibleTo request visibility rule"
- Then the result lists `visibleTo`

### Requirement: Cortex names the next step for an undrafted change

WHEN `cortex` is called for a change that does not exist, the error SHALL say to draft it first and list the active changes.

#### Scenario: Start before draft
- Given an active change `widget`
- When `cortex` action `start` is called for `gadget`
- Then the error says to draft it first and names `widget`
