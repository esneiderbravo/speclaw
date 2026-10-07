# Lawbook workflow

Canonical lawbook workflow for speclaw, extended with **Cortex** (One brain.
Many agents.): durable `harness.json`, role agents, empty packs catalog, cortex
skill/MCP/CLI, archive verdict gates, the Compass-first evidence gate backed
by a bounded per-project Compass call log, and a per-change status summary that
drives configurable coordinator status updates. Prior sync, reports, coverage,
ceremony, bugfix, EARS, and investigation requirements remain in force below.

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

### Requirement: Archive is blocked by direct requirement-coverage defects

When a change's delta specs declare at least one requirement identifier,
`specArchivePreconditions` SHALL append blocking reasons for every **direct**
coverage defect on items whose `Status` is in the configured gate statuses
(default: `approved`). Transitive defects SHALL NOT block archive. When no
requirement in the change's delta specs carries an identifier, the coverage
gate SHALL contribute no reasons (opt-in by adoption).

#### Scenario: Archiving blocked by uncovered requirement
- Given a change whose delta spec declares `req~new-thing~1` with
  `Needs: impl, utest`
- And only an `impl` link exists
- When `lawbook_archive` / archive runs
- Then archiving SHALL fail
- And the reason SHALL contain the requirement id, spec path and line, and the
  uncovered type

#### Scenario: Legacy change without identifiers is not blocked
- Given a change whose delta specs declare no requirement identifiers
- When archive runs
- Then the coverage gate SHALL contribute no blocking reasons

#### Scenario: Transitive defects do not block archiving
- Given a change whose identified requirements are all shallow-covered but one
  has a transitive defect
- When archive runs
- Then archiving SHALL succeed with respect to the coverage gate

#### Scenario: Coverage gate can be disabled
- Given `coverage.gateArchive: false` in lawbook config
- And a change with a direct coverage defect
- When archive runs
- Then the coverage gate SHALL contribute no blocking reasons

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

### Requirement: Explore locates through Compass before indexing or reading code

The `explore` step SHALL locate the affected code with `compass_find` and read
it with `compass_explore` before any other code access. WHEN `compass_find`
returns no result or reports a missing or stale index, the `explore` step SHALL
run `compass_index` (which is incremental and skips unchanged files by hash) and
retry. The `explore` step SHALL read code with Read/Grep only after it names
which Rule 1 fallback holds (a Compass call returned nothing useful, the graph is
missing and cannot be built, or the target is not indexed code).

WHEN the draft handoff has no complete explorer brief, the `draft` step SHALL
refresh that index before locating the affected code.

#### Scenario: Standalone draft refreshes the index before locating code
- Given a draft whose handoff has no complete explorer brief
- And the project index may be stale
- When the `draft` step begins understanding the code
- Then it runs `compass_index` first
- And it locates the affected code against the refreshed graph

#### Scenario: Explore starts with compass_find, not compass_index
- Given the shipped `explore` skill step `steps/01-investigate.md`
- When an explorer follows it against an indexed project
- Then its first code-locating call is `compass_find` or `compass_explore`
- And `compass_index` is called only after `compass_find` returned nothing or
  reported a missing or stale index

#### Scenario: Reading code requires a named fallback
- Given the shipped `explore` skill step `steps/01-investigate.md`
- When the step text is inspected
- Then it requires naming which Rule 1 fallback holds before any Read/Grep of
  indexed source code

### Requirement: A complete explorer brief is the planner code map

WHEN the Cortex coordinator dispatches the planner, the coordinator SHALL paste
the explorer brief into the planner prompt.

WHEN that brief is complete, the planner SHALL use it as the code map, call
`compass_find` or `compass_explore` only for a gap the brief names, and re-read
a file under `docs/standards/` only when the brief does not cite that file.

A complete explorer brief lists symbols with their file, callers and callees,
blast radius, the `docs/standards/` files already read, the recommended
approach, open questions, gaps, and a `Compass calls made: N` line counting the
Compass evidence calls (explore, find, diff_context, and their aliases) the
explorer made. Gaps are the phrase "nothing unresolved" or one or more named
symbols. The `explore` summarize step SHALL produce that brief.

#### Scenario: Dispatch carries the brief
- Given an explorer brief with symbols, callers, blast radius, standards read,
  the recommended approach, open questions, and gaps
- When the coordinator dispatches the planner
- Then the planner prompt contains that brief

#### Scenario: A complete brief is not re-investigated
- Given a planner handoff that includes a complete explorer brief
- When the draft understand step runs
- Then the planner does not run a fresh locate pass over symbols the brief
  already lists
- And Compass is called only for a gap the brief names

#### Scenario: The brief reports how many Compass calls were made
- Given the shipped `explore` skill step `steps/02-summarize.md`
- When an explorer writes the brief
- Then the brief contains a `Compass calls made: N` line

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

### Requirement: EARS pattern validation `req~ears-validate~1`

WHEN `lawbook_change` validate / `speclaw lawbook validate` runs, the system
SHALL classify each `### Requirement:` normative body into an EARS pattern
(ubiquitous, event, state, unwanted, optional, complex, or unstructured) and
SHALL emit diagnostics with stable codes. Complex SHALL require two distinct
preconditions among WHILE/WHEN/WHERE/IF; an IF…THEN body alone SHALL classify
as unwanted, not complex. WHILE `ears.severity` is `strict`, the system SHALL
treat unstructured bodies, missing modals, and IF/THEN mismatches as blocking
validation issues. speclaw SHALL NOT rewrite requirement files automatically;
it MAY emit a suggested rewrite.

Needs: impl, utest, ptest
Status: approved

#### Scenario: Unstructured requirement fails under strict
- Given `ears.severity: strict`
- And a requirement body that matches no EARS mold
- When validate runs for a change containing that requirement
- Then validation SHALL be invalid
- And the issues SHALL include an `ears/unstructured` (or equivalent) code
- And a suggested rewrite MAY be present

#### Scenario: Lenient projects warn instead of fail
- Given `ears.severity: lenient`
- And an unstructured requirement body
- When validate runs
- Then the result MAY be valid
- And warnings SHALL include the EARS diagnostic

#### Scenario: No automatic file rewrite
- Given a validate run that produces suggestions
- When the command completes
- Then every requirement file on disk SHALL be unchanged

### Requirement: Property coverage participates in validate and archive `req~ptest-archive-gate~1`

WHEN a change's identified requirements include `ptest` in effective needs,
validate and archive SHALL surface missing `ptest` coverage as defects using
the requirement-coverage reporter. Archive SHALL continue to refuse direct
coverage defects when `coverage.gateArchive` is true.

Needs: impl, utest
Status: approved

#### Scenario: Missing ptest blocks archive
- Given a delta requirement `req~example~1` with `Needs: ptest`
- And no `ptest` covering link
- When archive preconditions run
- Then archiving SHALL fail
- And the reason SHALL name the missing `ptest`

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

### Requirement: Archive seals structural code anchors

When `specArchive` succeeds, speclaw SHALL extract and resolve symbol/file
anchors from the change's delta specs, write them to
`lawbook/anchors/<capability>.json`, and project them into the Compass
`spec_anchors` table as specified by the `spec-drift` capability. Zero
resolvable anchors SHALL warn and SHALL NOT block archive. This structural
seal is distinct from the agent reconciliation requirement above: it fingerprints
code bodies, it does not rewrite delta markdown.

#### Scenario: Archive writes anchor JSON for a resolvable symbol
- Given a change whose delta names a uniquely resolvable function in backticks
- When the change is archived
- Then `lawbook/anchors/<capability>.json` SHALL exist with a unique-resolution
  anchor for that function

#### Scenario: Archive proceeds with a warning when nothing resolves
- Given a change whose delta yields no resolvable graph symbols
- When the change is archived
- Then archive SHALL succeed
- And the result SHALL warn that no structural anchors were sealed

### Requirement: Ceremony level is proposed from graph signals

speclaw SHALL compute a **proposed** ceremony level in `{0,1,2,3}` from
deterministic signals over an explicit target set (paths and/or symbols):
distinct files, modules, affected tests, impact blast size, whether a public
API or configured global file is touched, hotspot pressure from Compass
hotspots, and an only-docs short-circuit. Thresholds SHALL live under
`ceremony` in `lawbook/config.yaml` with built-in defaults when the block is
absent or invalid. A missing or stale Compass index SHALL degrade: speclaw
SHALL NOT invent a "small" level from ignorance — it SHALL omit a numeric
proposal (or mark `degraded`) and require a human-chosen level. The proposal
SHALL include the numeric score and a deterministic rationale string.

#### Scenario: Small single-module change proposes level 0
- Given an indexed project
- And targets touching one non-global, non-public file in one module with a
  small affected-test set
- When ceremony level is proposed
- Then the proposed level SHALL be 0
- And the rationale SHALL cite the signal values used

#### Scenario: Public or global touch is never proposed as level 0
- Given targets that include a package export entry or a configured global path
- When ceremony level is proposed
- Then the proposed level SHALL be at least 1

#### Scenario: Docs-only targets short-circuit to level 0
- Given targets whose every path is documentation
- And no path under `lawbook/specs/`
- When ceremony level is proposed
- Then the proposed level SHALL be 0

#### Scenario: Missing index does not assume level 0
- Given a project with no usable Compass index
- When ceremony level is proposed
- Then the result SHALL carry a degradation marker
- And it SHALL NOT assert proposed level 0 solely from missing data

### Requirement: Confirmed ceremony level is persisted

A proposed level SHALL NOT govern validate/archive until it is recorded in
`lawbook/changes/<name>/change.json` with the confirmed level, actor, and
timestamp. A confirmed level lower than the proposal SHALL require a reason.
A change directory with no `change.json` SHALL be treated as **level 3**.
Promotions SHALL append to an append-only history and MUST NOT delete
`record.md` when scaffolding higher-level artifacts.

#### Scenario: Missing change.json means full ceremony
- Given a change directory with no `change.json`
- When validate runs
- Then level-3 artifact rules SHALL apply

#### Scenario: Downgrade requires a reason
- Given a proposal of level 3
- When set is invoked with level 1 and no reason
- Then the call SHALL fail

#### Scenario: Promotion keeps record.md
- Given a level-0 change with `record.md`
- When the level is promoted to 2
- Then `proposal.md` and `tasks.md` SHALL be created (seeded when possible)
- And `record.md` SHALL still exist

### Requirement: Artifact gates follow the confirmed level

`specValidate` and `specArchivePreconditions` SHALL require exactly the
artifacts the confirmed level demands:

| Level | Required |
| --- | --- |
| 0 | `record.md` with a checkable task list; non-scaffold discipline report under `reports/` |
| 1 | `record.md`; `tasks.md`; ≥1 delta spec with a requirement; reports |
| 2 | `proposal.md`; `tasks.md`; delta specs; reports; design optional only with justification |
| 3 | `proposal.md`; `design.md`; `tasks.md`; delta specs; reports |

Every level SHALL still require evidence under `reports/` and checked tasks
(checklist in `record.md` for level 0). Delta-spec sync SHALL be required for
archive only when the level requires delta specs. When measured signals imply a
level at least two above the confirmed level, validate SHALL fail until the
change is promoted or an explicit justification is recorded.

#### Scenario: Level 0 validates without proposal or deltas
- Given a change confirmed at level 0 with `record.md` (checklist) and a
  discipline report
- And no `proposal.md` and no delta specs
- When validate runs
- Then the result SHALL be valid

#### Scenario: Level 0 without reports cannot archive
- Given a change confirmed at level 0 with an empty `reports/` folder
- When archive preconditions run
- Then archive SHALL be blocked naming the missing report

#### Scenario: Level 3 still needs design
- Given a change confirmed at level 3 with no `design.md`
- When validate runs
- Then the result SHALL be invalid

#### Scenario: Scope growth blocks validate
- Given a change confirmed at level 0
- And measured signals that now propose level 2 or higher
- When validate runs
- Then the result SHALL be invalid
- And the message SHALL mention promotion or justification

### Requirement: Published laws describe level-based ceremony

Shipped agent-facing law and standard documents (`LAWS.md`,
`docs/standards/lawbook.md`, and equivalent entry points that restate ceremony)
SHALL describe that artifact volume follows the confirmed ceremony level, and
SHALL NOT claim that every change always requires all four classic artifacts.

#### Scenario: Laws mention ceremony levels
- Given a project scaffolded or updated to a release that includes adaptive
  ceremony
- When `LAWS.md` is read
- Then it SHALL mention ceremony levels (or equivalent wording)
- And it SHALL NOT require proposal+design+tasks+deltas for every change
  unconditionally

### Requirement: Bugfix change type

`lawbook draft` SHALL support a bug change type that produces a `bugfix.md`
artifact instead of `proposal.md` and `design.md`, and the type SHALL be
recorded in the change metadata (`changeType: "bug"`). Changes without an
explicit `changeType` SHALL be treated as features.

#### Scenario: Bug draft produces the bugfix artifact
- Given an initialized lawbook workspace
- When `lawbook draft --bug duplicate-charges` runs
- Then `lawbook/changes/duplicate-charges/bugfix.md` SHALL exist
- And it SHALL contain the seven mandated section headings
- And `proposal.md` and `design.md` SHALL NOT exist
- And the change metadata SHALL record the type as `bug`

#### Scenario: Bug change validates without a proposal
- Given a change of type `bug` at level 1 with `bugfix.md`, `tasks.md` and one
  file under `reports/`
- When `specValidate` runs
- Then the result SHALL be valid

#### Scenario: A level 2 bug still requires a design
- Given a change of type `bug` recorded at level 2 with no `design.md`
- When `specValidate` runs
- Then the result SHALL be invalid
- And the message SHALL state that levels 2 and above require a design alongside
  `bugfix.md`

### Requirement: Feature draft scaffold `req~feature-draft~1`

WHEN `speclaw lawbook draft <name>` runs without `--bug`, or `lawbook_change`
action `draft` runs without `bug: true`, the system SHALL scaffold a feature
change under `lawbook/changes/<name>/` containing `reports/README.md` and a
`change.json` with `changeType: "feature"` and the proposed ceremony level.
WHERE a level is supplied, the system SHALL record it as the confirmed level and
SHALL write the stub artifacts that level requires, so that a fresh draft passes
validate without edits: `record.md` at level 0; `record.md`, `tasks.md`, and a
delta spec at level 1; `proposal.md`, `design.md`, `tasks.md`, and a delta spec
at levels 2 and 3. The delta spec SHALL be written to
`specs/<capability>/spec.md`, where the capability defaults to the change name
and MAY be supplied with `--capability` (MCP `capability`). WHERE that
capability already has a canonical spec, the delta SHALL start as a copy of it;
otherwise the delta SHALL be a placeholder carrying the
`<!-- speclaw:placeholder-delta -->` marker. WHILE a delta carries that marker,
validate SHALL warn about it and sync (including the sync inside archive) SHALL
refuse without promoting any file. IF the change directory already exists, or
the change or capability name of a feature draft is not kebab-case, THEN the
system SHALL refuse without writing any file. The kebab-case rule applies to
feature drafts only; `quick` and bug drafts keep their existing name handling. The `quick`, bug, and feature scaffolds SHALL share one
generic change-scaffold routine, and the `quick` and bug outputs SHALL remain
unchanged.

Needs: impl, utest
Status: approved

#### Scenario: Level-2 feature draft writes the stubs the level requires
- Given an initialised lawbook workspace
- When `speclaw lawbook draft add-widget --level 2 --json` runs
- Then `lawbook/changes/add-widget/proposal.md`, `design.md`, `tasks.md`,
  `specs/add-widget/spec.md`, and `reports/README.md` SHALL exist
- And `change.json` SHALL record `confirmedLevel` 2 and `changeType` `feature`
- And `bugfix.md` SHALL NOT exist

#### Scenario: A fresh draft validates at every level
- Given an initialised lawbook workspace
- When `speclaw lawbook draft add-widget --level N` runs for N in 0–3
- And `speclaw lawbook validate add-widget` runs with no edits
- Then validate SHALL report the change as valid

#### Scenario: A placeholder delta cannot be synced silently
- Given `speclaw lawbook draft add-widget --level 2` ran with no `--capability`
  and `lawbook/specs/add-widget/` does not exist
- When `speclaw lawbook validate add-widget` runs
- Then it SHALL report the change as valid with a placeholder-delta warning
- And `speclaw lawbook sync add-widget` SHALL fail without creating
  `lawbook/specs/add-widget/`

#### Scenario: Quick and bug drafts keep accepting their existing names
- Given an initialised lawbook workspace
- When `speclaw quick FAR-2199-fix` runs
- Then the change SHALL be scaffolded as before the shared routine existed

#### Scenario: The delta starts from an existing capability spec
- Given `lawbook/specs/widgets/spec.md` exists
- When `speclaw lawbook draft add-widget --level 2 --capability widgets` runs
- Then `specs/widgets/spec.md` in the change SHALL equal the canonical spec

#### Scenario: Draft without a level leaves the level unconfirmed
- Given an initialised lawbook workspace
- When `lawbook_change` action `draft` runs for `add-widget` with no `level`
- Then `change.json` SHALL carry the proposal and no `confirmedLevel`
- And validate SHALL apply level-3 artifact rules until a level is set

#### Scenario: An existing change directory is refused
- Given `lawbook/changes/add-widget/` already exists
- When `speclaw lawbook draft add-widget` runs
- Then the command SHALL fail naming the existing change
- And no file under that directory SHALL be modified

#### Scenario: Quick and bug drafts are unchanged by the shared scaffold
- Given the shared change-scaffold routine
- When `speclaw quick fix-typo` and `speclaw lawbook draft --bug dup-charge` run
- Then their files and `change.json` fields SHALL match the outputs before the
  routine was extracted

### Requirement: Bug artifact gates follow level and type

For changes with `changeType: "bug"`, `specValidate` and
`specArchivePreconditions` SHALL require:

| Level | Required |
| --- | --- |
| 0 | `bugfix.md` with sections 1, 2, 3, 5, 6; sections 4 and 7 MAY be `n/a:` with reason; discipline report |
| 1 | full `bugfix.md`; `tasks.md`; delta spec only when prevention requires it; reports |
| 2–3 | `bugfix.md`; `design.md`; `tasks.md`; delta when prevention requires it; reports |

Feature artifact rules SHALL remain unchanged when `changeType` is absent or
`feature`.

#### Scenario: Level 0 bug validates without proposal or deltas
- Given a change of type `bug` confirmed at level 0 with a complete `bugfix.md`
  (per level-0 section rules) and a discipline report
- When validate runs
- Then the result SHALL be valid
- And no `proposal.md` SHALL be required

#### Scenario: Missing delta when prevention requires a spec change blocks validate
- Given a change of type `bug` whose prevention section states a canonical
  requirement was missing
- And no delta spec adds that requirement
- When validate runs
- Then the result SHALL be invalid
- And the message SHALL name the missing delta spec

### Requirement: Mandatory reproduction and regression test

A bug change SHALL NOT be archivable unless it records a reproduction or an
explicit `unreproducible:` justification, and unless it references a regression
test or an instrumentation substitute. Prevention SHALL be answered (including
an explicit decline with reason).

#### Scenario: Missing regression test blocks archive
- Given a change of type `bug` whose `bugfix.md` regression test section is empty
- And all tasks are checked and `reports/` is non-empty
- When `specArchivePreconditions` runs
- Then it SHALL return a blocking precondition naming the missing regression test

#### Scenario: Unreproducible bug requires an explicit marker
- Given a change of type `bug` whose reproduction section contains neither steps
  nor an `unreproducible:` block
- When `specValidate` runs
- Then the result SHALL be invalid
- And the message SHALL state that the reproduction section requires steps or an
  explicit justification

#### Scenario: Mitigated resolution is recorded distinctly
- Given a change of type `bug` with an `unreproducible:` block and an
  instrumentation reference in place of a regression test
- When the change is archived
- Then the archived metadata SHALL record the resolution as `mitigated`
- And it SHALL NOT record the resolution as `fixed`

#### Scenario: Not-a-bug resolution still requires prevention
- Given a change of type `bug` whose resolution is `not-a-bug`
- And whose prevention section is empty
- When `specValidate` runs
- Then the result SHALL be invalid
- And the message SHALL state that a not-a-bug resolution requires a prevention
  entry

### Requirement: Deterministic bug investigation

`lawbook_investigate` SHALL rank candidate origins from the code index and git
history only, SHALL attach at least one reason to every suspect, and SHALL return
identical output for identical input and index state.

#### Scenario: Stack frames outrank graph neighbours
- Given an indexed project
- And a stack trace whose second frame resolves to the indexed symbol
  `verifyCharge`
- When `lawbook_investigate` is invoked with that trace
- Then `verifyCharge` SHALL appear among the suspects
- And its reasons SHALL include `stack-frame`
- And its score SHALL be higher than that of any suspect whose only reason is
  `frame-callee`

#### Scenario: External frames are not ranked as suspects
- Given a stack trace containing a frame inside `node_modules`
- When `lawbook_investigate` is invoked with that trace
- Then no suspect SHALL correspond to that frame
- And the frame SHALL appear in `unresolvedFrames` with reason `external`

#### Scenario: Unsupported language is refused explicitly
- Given a stack trace in a language speclaw does not index
- When `lawbook_investigate` is invoked with that trace
- Then `suspects` SHALL be empty
- And every frame SHALL appear in `unresolvedFrames` with reason `unparseable`
- And `guidance` SHALL name the supported languages

#### Scenario: Missing index returns no suspects
- Given a project with no index database
- When `lawbook_investigate` is invoked with any input
- Then `suspects` SHALL be empty
- And `degraded` SHALL contain `no-index`

#### Scenario: Unavailable signals degrade without failing
- Given an indexed project with no hotspot data available
- When `lawbook_investigate` is invoked with a resolvable stack trace
- Then suspects SHALL still be returned
- And `degraded` SHALL contain `no-hotspots`
- And no suspect SHALL carry a `hotspot` reason

### Requirement: Prevention closes the loop

Every bug change SHALL answer the prevention question. When prevention proposes
a new law, the section SHALL include a law block with id, enforcement mode, and
scope parseable by the executable-laws manifest schema. Explicitly declining
prevention with a reason SHALL be valid.

#### Scenario: Proposed law is emitted ready to adopt
- Given a bug change whose prevention section proposes a new law
- When `specValidate` runs
- Then the prevention section SHALL contain a law block with an id, an
  enforcement mode and a scope

#### Scenario: Explicitly declining prevention is accepted
- Given a bug change whose prevention section states that no law applies, with a
  reason
- When `specValidate` runs
- Then the result SHALL be valid

#### Scenario: A recurring root cause is surfaced
- Given an archived bug change whose root cause names the symbol `verifyCharge`
- When `lawbook_investigate` returns `verifyCharge` as a suspect
- Then the response SHALL reference the archived change directory

### Requirement: Published laws describe bug change type

Shipped agent-facing law and standard documents SHALL describe the bug change
type, `bugfix.md`, and `lawbook_investigate`, and SHALL NOT claim that every
change must use feature artifacts.

#### Scenario: Laws mention bugfix workflow
- Given a project updated to a release that includes bugfix specs
- When `LAWS.md` is read
- Then it SHALL mention bug changes or `bugfix.md` (or equivalent wording)
- And it SHALL mention graph-backed investigation for bugs


## Multi-agent harness (Cortex)

### Requirement: Default change loop is multi-agent

<!-- id: req~multiagent-loop~1 -->
<!-- Needs: impl, utest -->

WHEN a non-trivial change is run through the lawbook, THE SYSTEM SHALL treat
the host primary agent as a **coordinator** that advances stages via **Cortex**
and SHALL dispatch (or role-play) specialized roles — explorer,
planner, implementer, reviewer, tester, archiver — rather than performing
implementation, review, test, and archive in one undifferentiated session.

#### Scenario: Coordinator does not implement
- Given a change at ceremony level ≥ 1 under Cortex
- When the primary agent follows the `cortex` skill
- Then it SHALL NOT edit application source as the coordinator
- And it SHALL advance stages only through Cortex ops or by spawning/adopting
  the role for the current stage

### Requirement: Harness state is durable and deterministic

<!-- id: req~harness-state~1 -->
<!-- Needs: impl, utest -->

THE SYSTEM SHALL persist harness state in
`lawbook/changes/<name>/harness.json` and SHALL expose `status`, `start`,
`advance`, and `rework` through the `cortex` MCP tool and the CLI
`speclaw cortex`. Illegal stage transitions SHALL be rejected
without mutating state. THE SYSTEM MAY keep `lawbook_change` action `harness`
and `speclaw lawbook harness` as deprecated aliases that call the same engine.

#### Scenario: Illegal advance is rejected
- Given a harness in stage `exploring`
- When an agent requests `advance` claiming a jump to `archiving`
- Then the operation fails with a clear error
- And `harness.json` is unchanged

#### Scenario: Start initializes exploring
- Given an active change without `harness.json`
- When Cortex op `start` runs
- Then `harness.json` exists with stage `exploring` and iteration `0`

### Requirement: Compass call log `req~compass-call-log~1`

WHEN a Compass MCP tool (canonical or deprecated alias) or its CLI twin
(`explore`, `find`/`search`, `recall`, `impact`, `trace`, `diff-context`,
`index`) runs, the system SHALL append one JSON line `{at, tool}` naming the MCP
tool to `.speclaw/compass-calls.jsonl`. The append SHALL be best-effort and
SHALL NOT fail or delay the tool when the write fails. IF the log exceeds
256 KiB before an append, THEN the system SHALL rotate it to
`compass-calls.jsonl.1`, keeping at most one previous generation; concurrent
rotations SHALL NOT replace `.1` with a log that is under the cap, and SHALL NOT
drop the entries of such a log. Readers SHALL read at most the last 64 KiB of the
live log and SHALL skip partial or malformed lines; WHEN the whole live log fits
in that window but holds no entry at or before the reader's start time, readers
SHALL also read at most the last 64 KiB of `compass-calls.jsonl.1`. The evidence set SHALL be `compass_explore`, `compass_find`,
`compass_diff_context`, `compass_impact`, `compass_trace`, `compass_search`,
and `compass_recall`; `compass_index` and nudge entries SHALL NOT count as
evidence. The log SHALL be covered by the project's ignore rules for
`.speclaw/`. The log helper SHALL live in `src/shared/` so that Compass, Cortex,
and Foundation consume it without importing one another.

Needs: impl, utest
Status: approved

#### Scenario: An explore call is recorded
- Given an initialised project with an index
- When `compass_explore` is invoked through MCP
- Then `.speclaw/compass-calls.jsonl` SHALL gain a line whose `tool` is
  `compass_explore` and whose `at` is an ISO timestamp

#### Scenario: Index calls are logged but are not evidence
- Given a call log containing only `compass_index` entries
- When evidence calls are counted
- Then the count SHALL be 0

#### Scenario: The log rotates at its size cap
- Given a call log larger than 256 KiB
- When another call is recorded
- Then the previous content SHALL move to `compass-calls.jsonl.1`
- And the live log SHALL contain only the new line

#### Scenario: Rotation does not hide current-stage evidence
- Given a `compass_find` call recorded after the stage started
- And a later append that rotated it into `compass-calls.jsonl.1`
- When evidence calls since the stage start are counted
- Then the count SHALL be 1

#### Scenario: A write failure never fails the tool
- Given a `.speclaw/` path that cannot be written
- When a Compass tool runs
- Then the tool SHALL return its normal result

### Requirement: Compass evidence gate on Cortex advance `req~compass-evidence-gate~1`

WHEN Cortex `advance` leaves the `exploring` or `implementing` stage, the system
SHALL count the Compass evidence calls in the call log at or after the time the
current stage started (the `at` of the newest `history[]` entry whose `to`
equals the current stage) and SHALL return `compassEvidence` with the mode,
stage, start time, and count. The mode SHALL come from the top-level
`compassGate` key in `lawbook/config.yaml` (`off`, `warn`, or `strict`); WHERE the
key is absent or invalid, the mode SHALL be `warn`. IF the mode is `warn` and the
count is zero, THEN the advance SHALL succeed and the result SHALL carry a
`compass-first` warning. IF the mode is `strict` and the count is zero, THEN the
advance SHALL be rejected with an error naming the stage, the evidence tools,
and the `compassGate` key, and `harness.json` SHALL remain unchanged. The
`rework`, `start`, and `status` operations and advances from any other stage
SHALL NOT be gated. The cortex module SHALL read the key without importing the
lawbook module.

Needs: impl, utest
Status: approved

#### Scenario: Strict mode blocks an explore stage with no Compass calls
- Given `compassGate: strict` and a harness in stage `exploring`
- And no evidence call in the log since that stage started
- When `cortex` `advance` to `planning` runs
- Then the operation SHALL fail naming `compass_explore` and `compass_find`
- And `harness.json` SHALL be byte-identical to before

#### Scenario: Warn mode advances with a warning
- Given no `compassGate` key and a harness in stage `implementing`
- And only `compass_index` calls in the log since that stage started
- When `cortex` `advance` to `reviewing` runs
- Then the stage SHALL become `reviewing`
- And the result SHALL carry a `compass-first` warning and `compassEvidence.calls` 0

#### Scenario: Evidence since stage start satisfies the gate
- Given `compassGate: strict` and a harness in stage `exploring`
- And a `compass_find` call recorded after that stage started
- When `cortex` `advance` to `planning` runs
- Then the advance SHALL succeed
- And `compassEvidence.calls` SHALL be at least 1

#### Scenario: Calls before the stage started do not count
- Given `compassGate: strict` and a harness that entered `implementing` through
  `rework`
- And evidence calls recorded only before that rework entry
- When `cortex` `advance` out of `implementing` runs
- Then the operation SHALL fail

#### Scenario: Off mode and ungated stages skip the check
- Given `compassGate: off`, or a harness in stage `planning`
- When `cortex` `advance` runs with an empty call log
- Then the advance SHALL succeed without a `compass-first` warning

### Requirement: Cortex ships as an MCP module

<!-- id: req~cortex-module~1 -->
<!-- Needs: impl, utest -->

THE SYSTEM SHALL ship module `src/modules/cortex/` that registers the canonical
MCP tool `cortex` (actions `status` | `start` | `advance` | `rework` | `brief`)
and the CLI `speclaw cortex`. THE `brief` action SHALL return harness state plus
role, agentPath, skillHints, and nextOps for the current stage. THE cortex
module SHALL NOT import from the lawbook module; ceremony level on start SHALL
be read from `change.json` `confirmedLevel` (default 3).

#### Scenario: Brief maps implementing to implementer
- Given a harness in stage `implementing`
- When `cortex` action `brief` runs
- Then the response includes `role` equal to `implementer`
- And `skillHints` includes `build`

### Requirement: Archive requires harness verdicts

<!-- id: req~harness-archive-gate~1 -->
<!-- Needs: impl, utest -->

WHEN archiving a change that has a harness (or after Cortex is the default
workflow), THE SYSTEM SHALL refuse `lawbook_archive` while test verdict is not
`PASS`. For ceremony level ≥ 1, THE SYSTEM SHALL also refuse archive while
review verdict is not `PASS`. Level 0 SHALL require test PASS and MAY omit
review.

#### Scenario: Archive blocked without test PASS
- Given a level-0 change with tasks checked and a discipline report
- And harness stage past implementing but `verdicts.test` is null
- When archive is attempted
- Then archive fails citing the missing test PASS

#### Scenario: Level 1+ needs review PASS
- Given a level-2 change with `verdicts.test` PASS and `verdicts.review` null
- When archive is attempted
- Then archive fails citing the missing review PASS

### Requirement: Role agents ship with the workflow

<!-- id: req~role-agents-default~1 -->
<!-- Needs: impl, utest -->

THE SYSTEM SHALL install role agent definitions (explorer, planner,
implementer, reviewer, tester, archiver) into `ai-specs/agents/` as part of
`installWorkflow` (always-on with the lawbook), and SHALL symlink `agents`
into Cursor, Codex, and Windsurf IDE dirs in addition to Claude and Generic.
The tool lists in the shipped role agent definitions SHALL name only canonical
MCP tools, which are always registered: deprecated aliases such as
`compass_impact`, `compass_trace`, and `lawbook_level` SHALL NOT appear, and the
explorer SHALL list `compass_diff_context`. No shipped agent, skill, command, or
rule text SHALL name a deprecated alias tool.

#### Scenario: Scaffold without packs still installs role agents
- Given `speclaw init` with no tool packs selected
- When scaffold completes
- Then `ai-specs/agents/` contains the Cortex role agent files
- And Cursor's `linkTargets` include `agents` when Cursor is configured

#### Scenario: Role agents list canonical tools only
- Given the shipped `agents/explorer.md` and `agents/planner.md`
- When their `tools` frontmatter is inspected
- Then neither SHALL list `compass_impact`, `compass_trace`, or `lawbook_level`
- And the explorer SHALL list `compass_explore`, `compass_find`, and
  `compass_diff_context`

#### Scenario: Shipped workflow texts name no alias tool
- Given every shipped markdown file under the lawbook assets (agents, skills,
  commands, rules)
- When it is scanned for the deprecated alias tool names
- Then no alias name SHALL appear
- And every `mcp__speclaw__*` entry in an agent `tools` list SHALL be one of
  the nine canonical tools

### Requirement: Domain agent pack is removed

<!-- id: req~remove-agents-pack~1 -->
<!-- Needs: impl, utest -->

THE SYSTEM SHALL NOT ship the `agents` tool pack
(backend-developer / frontend-developer / product-strategy-analyst). The pack
catalog MAY be empty. WHEN the catalog is empty, interactive init SHALL NOT
prompt for packs. WHEN a project manifest still lists `agents`, update SHALL
skip reinstalling that unknown pack.

#### Scenario: Empty catalog skips pack prompt
- Given an empty packs manifest
- When interactive init runs
- Then the packs multiselect is omitted
- And scaffold is called with an empty pack list

### Requirement: Build hands off before final gates

<!-- id: req~build-hand-off~1 -->
<!-- Needs: impl -->

THE `build` skill SHALL instruct the implementer to stop after implementing
tasks and updating specs/checkboxes, and SHALL hand off to Cortex for
review and test. Quality gates, manual verification, and discipline reports
SHALL be owned by the tester role; sync and archive by the archiver role.

#### Scenario: Build step chain ends at implement hand-off
- Given the managed `build` skill assets
- When an implementer completes `steps/03-implement.md`
- Then the next step directs Cortex advance to reviewing (or testing at
  level 0), not quality gates inside build

### Requirement: Cortex skill coordinates the loop

<!-- id: req~cortex-skill~1 -->
<!-- Needs: impl -->

THE SYSTEM SHALL ship a `cortex` skill and
`commands/lawbook/cortex.md` that tell the primary agent to read
Cortex status/brief, spawn or adopt the current role with its permission
contract, surface planner questions to the human, enforce max rework, and
loop until archive succeeds or the human stops the run. The dispatch step SHALL
give an explorer dispatch template that names the intent, symbols or concepts,
and questions to answer, and SHALL NOT tell the explorer which files to read.
WHEN the explorer finishes, the dispatch step SHALL direct the coordinator to
propose a ceremony level with `lawbook_change` action `level` mode `propose`,
collect the planner's questions, and ask the human the explorer's open
questions, the planner's questions, and the level confirmation in a single
`pauseForQuestions` round, and SHALL direct the coordinator to record the
answered level with mode `set` before the planner drafts.

#### Scenario: Cortex dispatcher stays thin
- Given the `cortex` SKILL.md dispatcher
- When token budget is measured
- Then it stays under the declared dispatcher cap and points only at step 01

#### Scenario: One question round covers explorer, planner, and level
- Given the shipped `skills/cortex/steps/02-dispatch-loop.md`
- When its text is inspected
- Then it directs one `pauseForQuestions` round that batches explorer open
  questions, planner questions, and the ceremony-level confirmation
- And it directs `lawbook_change` level mode `set` after the answers

#### Scenario: Explorer dispatch names symbols, not files
- Given the shipped `skills/cortex/steps/02-dispatch-loop.md`
- When its explorer dispatch template is inspected
- Then it asks for intent, symbols or concepts, and questions
- And it does not instruct the explorer to read named file paths

### Requirement: Cortex status summary `req~cortex-status-summary~1`

WHEN the `cortex` MCP tool action `status` or the CLI `speclaw cortex status`
runs for a change, the system SHALL return a `summary` next to `state`. WHERE
the change has a `harness.json`, the `summary` SHALL carry `change`, `stage`,
`role` (the role that `brief` maps the stage to), `stageStartedAt` (the `at` of
the newest `history[]` entry whose `to` equals the stage), `elapsedMinutes`
(whole minutes since `stageStartedAt`, never negative), `tasks` as
`{done, total}` counted from the checkbox list items of `tasks.md` — or of
`record.md` when `tasks.md` is absent, and `null` when neither exists —,
`iteration`, `maxRework`, `pendingVerdicts` (`review` when the harness level is
at least 1 and the review verdict is not `PASS`, then `test` when the test
verdict is not `PASS`), the `openQuestions` count, `statusIntervalMinutes`, and
`line`, a single-line English rendering of those fields. IF the change has no
`harness.json`, THEN the `summary` SHALL be `null`. The `cortex` MCP input
schema SHALL NOT change. WHEN `speclaw cortex status` runs without `--json`,
the CLI SHALL write `summary.line` to stderr and SHALL keep stdout a single JSON
document. The cortex module SHALL compute the summary without importing the
lawbook module. The `status` result SHALL place `summary` before `state`. WHEN
the MCP `status` result would exceed the brief output budget, the system SHALL
keep `summary` complete and the result valid JSON by dropping the oldest
`state.history` entries and reporting their count as `historyOmitted`, and IF
an empty history still does not fit, THEN `state` SHALL be `null` with
`stateOmitted: true`. The CLI and `harness.json` SHALL keep the full history.

Needs: impl, utest
Status: approved

#### Scenario: Status returns the summary for a running change
- Given a level-2 change in stage `implementing` whose history entered
  `implementing` 12 minutes ago
- And a `tasks.md` with 3 checked and 6 unchecked tasks
- And verdicts review `null` and test `null`, iteration 0, max rework 3
- When `cortex` action `status` runs
- Then `summary.role` SHALL be `implementer`
- And `summary.elapsedMinutes` SHALL be 12
- And `summary.tasks` SHALL be `{done: 3, total: 9}`
- And `summary.pendingVerdicts` SHALL be `["review", "test"]`
- And `summary.line` SHALL be one line naming the change, `implementing`,
  `12m in stage`, `tasks 3/9`, `rework 0/3`, and `pending: review, test`

#### Scenario: Level 0 owes only the test verdict and counts record.md
- Given a level-0 change with `record.md` holding 2 checked of 2 tasks and no
  `tasks.md`
- And a test verdict that is not `PASS`
- When `cortex` action `status` runs
- Then `summary.tasks` SHALL be `{done: 2, total: 2}`
- And `summary.pendingVerdicts` SHALL be `["test"]`

#### Scenario: Questions stage says the human owes answers
- Given a harness in stage `questions` with 2 open questions
- When `cortex` action `status` runs
- Then `summary.openQuestions` SHALL be 2
- And `summary.line` SHALL say that the run is waiting on the human for 2
  questions

#### Scenario: A long history keeps the summary on the MCP path
- Given a running harness with 30 history entries with long notes, whose
  `status` JSON exceeds the brief output budget
- When the `cortex` MCP tool action `status` runs
- Then the text SHALL parse as JSON whose first key is `summary`
- And `summary` SHALL be complete, including `statusIntervalMinutes`
- And `historyOmitted` plus the kept `state.history` length SHALL be 30, with
  the newest entry kept

#### Scenario: No harness gives a null summary
- Given a change directory without `harness.json`
- When `cortex` action `status` runs
- Then the result SHALL carry `state` `null` and `summary` `null`

#### Scenario: CLI prints the line on stderr unless --json
- Given a change with a running harness
- When `speclaw cortex status --change <name>` runs
- Then stderr SHALL contain `summary.line`
- And stdout SHALL parse as JSON with a `summary` field
- And with `--json` stderr SHALL NOT contain `summary.line`

### Requirement: Status update interval is configurable `req~cortex-status-interval~1`

The system SHALL read the status-update interval in minutes from the
`statusIntervalMinutes` key inside the top-level `cortex` block of
`lawbook/config.yaml` and SHALL report it as `summary.statusIntervalMinutes`.
IF the file, the `cortex` block, or the key is absent, or the value is not a
whole number of zero or more, THEN the interval SHALL be 5 and the read SHALL
NOT fail. IF the value is greater than 60, THEN the interval SHALL be 60. A value of 0 SHALL mean that unsolicited status updates are disabled.
The cortex module SHALL read the key without importing the lawbook module.

Needs: impl, utest
Status: approved

#### Scenario: Absent key defaults to 5
- Given a `lawbook/config.yaml` with no `cortex` block
- When `cortex` action `status` runs for a running change
- Then `summary.statusIntervalMinutes` SHALL be 5

#### Scenario: Configured value is reported
- Given `cortex:` with `statusIntervalMinutes: 10` in `lawbook/config.yaml`
- When `cortex` action `status` runs
- Then `summary.statusIntervalMinutes` SHALL be 10

#### Scenario: Zero disables updates
- Given `cortex:` with `statusIntervalMinutes: 0`
- When `cortex` action `status` runs
- Then `summary.statusIntervalMinutes` SHALL be 0

#### Scenario: Invalid values fall back to 5
- Given `statusIntervalMinutes` set to `-1`, `abc`, or `2.5`, or no
  `lawbook/config.yaml`
- When the interval is read
- Then it SHALL be 5
- And no error SHALL be raised

#### Scenario: Values above 60 are capped at 60
- Given `statusIntervalMinutes` set to `61` or `1440`
- When the interval is read
- Then it SHALL be 60

### Requirement: Coordinator posts status updates during a run `req~cortex-status-updates~1`

WHILE a Cortex run is active and `summary.statusIntervalMinutes` is greater
than 0, the `cortex` skill SHALL direct the coordinator to post a compact status
update after every Cortex op and just before every blocking role dispatch, and,
WHERE the host offers a session timer (for example Claude Code `CronCreate`),
to create one recurring timer every `statusIntervalMinutes` minutes that reads
`cortex` action `status` and posts the update. The update SHALL name the change,
the stage and active role, the elapsed time in the stage, the tasks done and
total, the rework iteration and maximum, and the pending verdicts, and SHALL be
written in the language of the human's most recent messages while stage names,
role names, tool names, file paths, and change names stay in English. The skill
SHALL direct the coordinator to create the timer only inside a Cortex run and
never more than one per run, to prefer background role dispatch so that the
timer can fire, to skip timer pings while the stage is `questions`, and to
delete the timer when the stage reaches `done`, when the run stops, or when the
human asks to stop the updates; after that request the coordinator SHALL post
no further unsolicited update for the run. On a host without a session timer,
the after-op and before-dispatch updates SHALL stand in for the timer. The
skill SHALL direct the coordinator to create the timer only when the summary is
non-null and the stage is not `done`, to keep the id the timer tool returns and
delete the timer by that id, to express an interval of 1 to 59 minutes as an
every-N-minutes schedule and an interval of 60 as an hourly schedule, and to
make the timer prompt name the change and the rules above (skip in `questions`,
session language, self-delete at `done` or stop).

Needs: utest
Status: approved

#### Scenario: The load step sets up the timer from the summary
- Given the shipped `skills/cortex/steps/01-load-or-start.md`
- When its text is inspected
- Then it reads `statusIntervalMinutes` from the `status` summary
- And it creates at most one `CronCreate` timer, only inside a Cortex run, and
  none when the interval is 0
- And it creates the timer only when the summary is non-null and the stage is
  not `done`
- And it keeps the id `CronCreate` returns (or checks `CronList`) so exactly
  one timer exists and `CronDelete` targets it
- And it gives a valid schedule for 1–59 minutes and for 60
- And the timer prompt names the change and the rules: skip in `questions`,
  session language, self-delete at `done` or stop

#### Scenario: The dispatch loop posts updates in the session language
- Given the shipped `skills/cortex/steps/02-dispatch-loop.md`
- When its text is inspected
- Then it directs an update after every Cortex op and before every blocking
  dispatch
- And it requires the session's language with stage, role, and tool names and
  paths kept in English
- And it skips timer pings in the `questions` stage
- And it tells the coordinator to stop the updates when the human asks

#### Scenario: Completion deletes the timer
- Given the shipped `skills/cortex/steps/03-complete.md`
- When its text is inspected
- Then it directs `CronDelete` of the status timer at `done` or when the run
  stops
