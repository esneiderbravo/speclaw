# Lawbook workflow

Delta spec for the reporting and archive-gate behavior of the workflow. This
supersedes the canonical `lawbook-workflow` spec, keeping the sync
reconciliation and archive gate unchanged and strengthening the discipline
reports into a required structure.

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

### Requirement: Every change carries a reports folder

Every change SHALL contain a `reports/` folder under
`lawbook/changes/<name>/`. The `draft` step SHALL scaffold it when creating the
change, so the folder is part of the change's structure before implementation.
The scaffolded `reports/README.md` SHALL name the discipline reports expected
for the change and point at the required report structure.

#### Scenario: Draft scaffolds the reports folder
- Given a request to draft a new change
- When the `draft` step writes the change artifacts
- Then a `reports/` folder exists under `lawbook/changes/<name>/`
- And its `README.md` names the expected discipline reports and references the
  required report structure

### Requirement: Build produces per-discipline test reports

The `build` step SHALL, as part of implementing a change, write one report per
relevant discipline into `reports/` (for example `backend.md`, `frontend.md`).
Each report SHALL record what was tested and the real results — unit,
integration, and end-to-end as applicable to the feature — including the
commands run and their output. Disciplines not touched by the change MAY be
omitted; a report MAY state that a given test kind does not yet apply and record
the gates and manual verification that stood in.

#### Scenario: Build records evidence of testing
- Given a change under implementation that touches backend behavior
- When the `build` step completes
- Then `reports/backend.md` exists and records the tests run and their results

### Requirement: Discipline reports follow a required structure

Each discipline report SHALL follow a required structure so that report quality
is reproducible rather than dependent on improvisation. A report SHALL contain,
in order:
- a title and header identifying the discipline, the change, the date, the
  branch, and the environment or working directory the commands ran in;
- a gates-and-results table listing each check, the exact command run, and its
  real result including pass/fail counts;
- a section listing the tests added or updated and what each asserts;
- a spec-scenario coverage table mapping each `#### Scenario` in the change's
  delta specs to how it was verified (an automated test, a gate, or a manual
  step);
- a section declaring any pre-existing or unrelated failures with evidence that
  they are not caused by the change, or stating that there are none;
- a section declaring any manual steps not automated, or stating that there are
  none;
- a one-line verdict.

When a test kind does not yet apply (for example, no unit-test runner exists),
the report SHALL say so in place of that evidence and record the gates and
manual verification that stood in.

#### Scenario: A discipline report carries the required sections
- Given a change under implementation that touches a discipline
- When the `build` step writes that discipline's report
- Then the report has the header, gates-and-results table, tests-added section,
  spec-scenario coverage table, pre-existing-failures section, pending-manual
  section, and a verdict

#### Scenario: Pre-existing failures are declared honestly
- Given a quality gate that reports a failure not caused by the change
- When the `build` step writes the report
- Then the report declares the failure as pre-existing or unrelated with
  evidence, rather than omitting it or attributing it to the change

#### Scenario: Every delta-spec scenario is accounted for
- Given a change whose delta specs contain testable scenarios
- When the `build` step writes the discipline reports
- Then each scenario appears in a coverage table with how it was verified

### Requirement: Archive is blocked until the change is complete

The `archive` step SHALL refuse to archive a change, reporting the reason
instead of proceeding, when any of the following holds:
- any task in `tasks.md` is still unchecked;
- the change has no discipline report under `reports/` — a folder that holds
  only the scaffolded `reports/README.md` does not satisfy the gate;
- the change's delta specs are not synced — the canonical specs do not already
  match the change's delta specs.

These checks SHALL be enforced deterministically in the engine so that both the
`lawbook_archive` tool and the CLI are gated. The archive SHALL proceed only
when every check passes.

#### Scenario: Unchecked task blocks archive
- Given a change with at least one unchecked task in `tasks.md`
- When the `archive` step runs
- Then the archive is refused and the unchecked task is reported

#### Scenario: Missing reports block archive
- Given a change whose `reports/` folder is absent or empty
- When the `archive` step runs
- Then the archive is refused and the missing reports are reported

#### Scenario: The reports README scaffold alone does not satisfy the gate
- Given a change whose `reports/` folder holds only `README.md`
- When the `archive` step runs
- Then the archive is refused because no discipline report is present

#### Scenario: Unsynced specs block archive
- Given a change whose delta specs differ from the canonical specs
- When the `archive` step runs
- Then the archive is refused and the change is directed to `sync` first

#### Scenario: A complete change archives
- Given a change with all tasks checked, reports present, and specs synced
- When the `archive` step runs
- Then the change is archived

### Requirement: Archive reconciles drift before it can pass the gate

Before archiving, the `archive` step SHALL run the reconciliation review from
the `sync` step. When the code has drifted past the delta specs, the agent SHALL
reconcile the delta specs and `sync` them; because unsynced specs block the
archive, drift cannot be archived without first being captured in the specs.

#### Scenario: Drift must be reconciled and synced before archive
- Given a completed change whose code drifted past its delta specs
- When the agent runs the `archive` step
- Then the agent reconciles the delta specs and syncs them
- And only then does the archive pass the specs-synced gate
