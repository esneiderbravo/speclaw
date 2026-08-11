# Lawbook workflow

Delta spec for grounding drafts in the current canonical specs and a fresh index,
and for making spec promotion divergence visible. This supersedes the canonical
`lawbook-workflow` spec, keeping the sync reconciliation, discipline-report
structure, verification-safety, and archive-gate requirements unchanged, and
adding capability-reuse, index-freshness, validate-warning, and
new-versus-updated-promotion rules. This revision additionally recognizes `api`
as a first-class discipline report and makes it mandatory whenever a change
touches an API surface.

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
discipline the change touched into `reports/`, each file named for its
discipline (`<discipline>.md`). The set of disciplines is **open, not fixed**:
`backend` (`backend.md`), `frontend` (`frontend.md`), and `api` (`api.md`) are
common, and other disciplines — for example `database`, `infra`, `security`,
`performance`, or `e2e` — SHALL be reported with a clearly named file whenever
the change exercises that concern. Each report SHALL record what was tested and
the real results — unit, integration, and end-to-end as applicable to the
feature — including the commands run and their output. Disciplines not touched by
the change MAY be omitted; a report MAY state that a given test kind does not yet
apply and record the gates and manual verification that stood in.

#### Scenario: Build records evidence of testing
- Given a change under implementation that touches backend behavior
- When the `build` step completes
- Then `reports/backend.md` exists and records the tests run and their results

#### Scenario: A full-stack change ships backend, frontend, and api reports
- Given a change that touches backend behavior, a frontend flow, and an API
  endpoint
- When the `build` step completes
- Then `reports/backend.md`, `reports/frontend.md`, and `reports/api.md` all
  exist and each records the tests run and their real results

#### Scenario: A discipline beyond the common set gets its own named report
- Given a change that exercises a concern the common names do not cover (for
  example a database migration, an infrastructure/pipeline change, or a security
  surface) and touches no endpoint or UI
- When the `build` step completes
- Then a clearly named report (for example `database.md`, `infra.md`, or
  `security.md`) records that concern's tests and results
- And it is not folded into an unrelated discipline's report

### Requirement: API changes carry an API discipline report

When a change touches an API surface — it adds or modifies an endpoint, its
request/response contract, its status codes, or its auth/permission or ordering
guarantees — the `build` step SHALL write a dedicated `reports/api.md`. The API
report is not optional for such a change: a backend unit report or a frontend
report does not substitute for it, because the contract is a distinct concern
that neither captures on its own. A change that touches no API surface MAY omit
`api.md`.

The `api.md` report SHALL follow the required discipline-report structure and
SHALL, within it, document the endpoint contract: the method and path, the auth
and permissions required, the response shape and every status code the change
governs (for example 200/401/403/404), and any ordering or consistency
guarantee. It SHALL record how the contract was exercised — through a test
client and/or a live request (for example `curl`) — and, per the
verification-safety requirement, how that exercise stayed isolated from any live
data store.

#### Scenario: An endpoint change requires an api report
- Given a change that adds or modifies an API endpoint or its contract
- When the `build` step completes
- Then `reports/api.md` exists and documents the endpoint contract, its status
  codes, and how the contract was exercised

#### Scenario: A backend report does not substitute for the api report
- Given a change that touches an API surface
- When the `build` step writes only `reports/backend.md` and omits `reports/api.md`
- Then the change is incomplete: the missing `api.md` is reported as required

#### Scenario: A change with no API surface may omit the api report
- Given a change that touches no endpoint or API contract
- When the `build` step completes
- Then `reports/api.md` MAY be absent and its absence is not a defect

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

### Requirement: Verification never mutates real data without authorization

The `build` step's verification SHALL NOT create, update, or delete data in a
real data store — a production or development database, or files that hold the
user's real data — as a side effect of exercising or proving a change. This
prohibition includes seeding or tearing down test data and running raw store
commands (for example direct SQL) against a live store.

Verification SHALL be isolated by construction: it runs against an ephemeral or
throwaway store (a temporary copy, an in-memory database, a dedicated test
store) or inside a transaction that is rolled back, so the user's real data is
never touched. A snapshot-and-restore of a live store is NOT a sanctioned method
of isolation.

When isolation is genuinely not possible and a write to a real store is
required, the agent SHALL stop and ask the user first, stating exactly what it
will write and to which store, and SHALL proceed only after explicit
authorization. A backup is NOT a substitute for authorization. The discipline
report SHALL record how verification was isolated, or the authorization
obtained.

#### Scenario: Verification is isolated from real data by default
- Given a change whose behavior reads or writes a data store
- When the agent verifies the change in the `build` step
- Then the verification runs against an ephemeral/throwaway store or a
  rolled-back transaction
- And the user's real data store is not modified

#### Scenario: A real-data write is gated on explicit authorization
- Given verification that genuinely cannot be isolated from the real store
- When the agent needs to write to that real store
- Then the agent stops and states exactly what it will write and to which store
- And it proceeds only after the user explicitly authorizes it

#### Scenario: Raw store commands are not run against a live store unprompted
- Given a live data store holding the user's real data
- When the agent is verifying a change
- Then it does not run raw store commands (e.g. direct SQL writes) against that
  live store without prior authorization

#### Scenario: The report records how verification stayed safe
- Given a completed verification of a change touching a data store
- When the discipline report is written
- Then it records how the verification was isolated, or the authorization that
  was obtained for any real-store write

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

### Requirement: Draft and explore refresh the code index first

The `draft` and `explore` steps SHALL refresh the code index (`compass_index`,
which is incremental and skips unchanged files by hash) before reasoning about
the code, so their decisions rest on the current graph rather than a stale one.
This strengthens the previous "index only if missing" guidance: the index is
refreshed for freshness, not merely created when absent.

#### Scenario: Draft refreshes the index before locating code
- Given a request to draft a change against a project whose index may be stale
- When the `draft` step begins understanding the code
- Then it runs `compass_index` first
- And it locates the affected code and capability against the refreshed graph

#### Scenario: Explore refreshes the index before investigating
- Given a request to explore against a project whose index may be stale
- When the `explore` step begins investigating the code
- Then it runs `compass_index` first

### Requirement: Draft reuses existing capabilities by exact name

The `draft` step SHALL list the canonical capabilities under `lawbook/specs/`
before writing any delta spec. When a change modifies behavior that an existing
canonical capability already governs, the draft SHALL place its delta under that
capability's **exact** folder name so promotion updates the existing spec. A new
capability folder SHALL be introduced only as a deliberate choice for a
genuinely distinct area of behavior — never as an accidental near-duplicate of
an existing one. A capability is named for its area of behavior, not for the
change (the change name is separate and per-feature).

#### Scenario: A change to existing behavior reuses the canonical capability name
- Given a canonical capability `transfers` and a change that alters transfer behavior
- When the `draft` step writes the delta spec
- Then the delta lives under `specs/transfers/` (the exact existing name)
- And a later `sync` updates `lawbook/specs/transfers/spec.md` rather than
  creating a near-duplicate capability

#### Scenario: A genuinely new capability is introduced deliberately
- Given a change that introduces a behavior area no canonical capability covers
- When the `draft` step writes the delta spec
- Then it creates a new capability folder as an intentional choice
- And the choice is recorded (for example in the proposal) rather than made by
  accidentally misnaming an existing capability

### Requirement: Draft grounds a capability delta in the current canonical spec

Because `sync` overwrites the whole capability file, the `draft` step SHALL,
when updating an existing capability, start that capability's delta spec from the
**current canonical content** and edit on top of it, so that requirements already
in the canonical are carried forward and not dropped on promotion. Requirements
are removed from a capability only as a deliberate edit, never as a side effect
of authoring the delta from scratch.

#### Scenario: Updating a capability preserves its existing requirements
- Given a canonical capability spec that already holds several requirements
- When the `draft` step writes a delta that updates that capability
- Then the delta includes the existing requirements plus the change's additions
- And promoting it does not drop the previously canonical requirements

### Requirement: Validate warns about capability divergence

The `lawbook_validate` step SHALL emit advisory warnings — reported separately
from the blocking issues and NOT affecting the change's validity — for two forms
of divergence from the canonical specs:

- **Near-duplicate capability.** When a delta's capability is not an existing
  canonical capability but is a near-match of one (a small edit-distance from an
  existing name), validate SHALL warn that the delta may have meant to update the
  existing capability.
- **Dropped requirements.** When a delta's capability matches an existing
  canonical capability, validate SHALL warn if the delta omits one or more
  `### Requirement:` headers that the canonical currently contains.

These are warnings, not issues: a change with only warnings is still valid, so a
deliberate new capability or a deliberate `REMOVED` requirement is not blocked.

#### Scenario: Near-duplicate capability name raises a warning
- Given a canonical capability `transfers`
- And a change whose delta capability is `transfer`
- When `lawbook_validate` runs
- Then it reports a warning that the delta may have meant to update `transfers`
- And the change is not marked invalid solely because of that warning

#### Scenario: Dropping a canonical requirement raises a warning
- Given a canonical capability spec containing requirements A and B
- And a change whose delta for that capability contains only requirement A
- When `lawbook_validate` runs
- Then it reports a warning that requirement B present in the canonical is absent
  from the delta

#### Scenario: An exact-name delta that keeps all requirements raises no such warning
- Given a delta under an existing capability's exact name that retains every
  canonical requirement
- When `lawbook_validate` runs
- Then it reports no near-duplicate or dropped-requirement warning

### Requirement: Sync and archive report created versus updated capabilities

The `lawbook_sync` and `lawbook_archive` steps SHALL, in their promotion result,
distinguish each promoted capability as **created** (no canonical spec existed at
that path before promotion) or **updated** (an existing canonical spec was
overwritten), so that an unintended new capability is visible in the output
rather than silently promoted. This comparison is of file paths only and keeps
`lawbook_sync` a deterministic, code-blind copy.

#### Scenario: A new capability is reported as created
- Given a change whose delta introduces a capability with no canonical spec yet
- When `lawbook_sync` promotes the delta
- Then the result reports that capability as created

#### Scenario: An existing capability is reported as updated
- Given a change whose delta matches an existing canonical capability
- When `lawbook_sync` promotes the delta
- Then the result reports that capability as updated
