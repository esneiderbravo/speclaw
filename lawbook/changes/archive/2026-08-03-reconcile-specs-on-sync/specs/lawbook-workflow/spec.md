# Lawbook workflow

Delta spec for the reconciliation behavior of the `sync` and `archive` steps.

### Requirement: Sync reconciles built code into the delta specs

The `sync` step SHALL, before promoting a change's delta specs into the
canonical specs, reconcile the change's implemented code against its delta
specs and write any built-but-unspecified behavior into those delta specs, so
that what is promoted matches what was actually built.

The reconciliation SHALL be performed by the agent (using the change's branch
diff since it was drafted and the code graph), not by the deterministic copy
tool. The `lawbook_sync` tool MUST remain a deterministic copy of the delta
spec files and MUST NOT itself inspect code.

#### Scenario: Behavior built after drafting is captured before promotion
- Given a change whose code implements behavior absent from its delta specs
- When the agent runs the `sync` step
- Then the agent reconciles the delta specs to describe that behavior
- And `lawbook_sync` promotes delta specs that match the implemented behavior

#### Scenario: No drift leaves the specs unchanged
- Given a change whose delta specs already describe all implemented behavior
- When the agent runs the `sync` step
- Then no reconciling edits are made to the delta specs
- And `lawbook_sync` promotes the delta specs as-is

### Requirement: Archive recommends a reconciling sync when code has drifted

The `archive` step SHALL run the same reconciliation review before archiving.
When it detects behavior that was built but is not reflected in the delta
specs, it SHALL recommend a reconciling `sync`, mark that recommendation as
recommended, and present short insights describing what was built outside the
original contract and why it matters.

The archive SHALL proceed only after the delta specs have been reconciled or
the user has explicitly accepted the drift. The recommendation SHALL be
advisory and SHALL NOT hard-block an archive that the user chooses to proceed
with after acknowledging the drift.

#### Scenario: Drift found — sync recommended with insights
- Given a completed change whose code drifted past its delta specs
- When the agent runs the `archive` step
- Then the agent recommends a reconciling sync marked as recommended
- And it shows short insights of what was built outside the contract and why
- And it does not archive until the specs are reconciled or the drift is
  explicitly accepted

#### Scenario: User accepts known drift and archives
- Given the agent has recommended a reconciling sync for detected drift
- When the user explicitly accepts the drift instead of reconciling
- Then the archive proceeds

#### Scenario: No drift — archive proceeds without a recommendation
- Given a completed change whose delta specs match its implemented behavior
- When the agent runs the `archive` step
- Then no sync recommendation is shown
- And the change is archived
