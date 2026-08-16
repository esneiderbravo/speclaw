# Law enforcement

Runtime enforcement of a project's declared laws through agent hooks. speclaw
compiles the laws into hook configuration for hook-capable agents, evaluates a
pending or completed agent action against the laws whose scope matches, and
returns a verdict that can block the action. This capability governs the `Law`
model and `.speclaw/laws-manifest.json`, the `speclaw_check` MCP tool and its
`speclaw check` CLI twin, the hook compiler and its idempotent merge into an
agent's settings, the `AgentDef` hook capability, the context-coverage audit,
glob validation, and the batch verifier `law_verify` with its `speclaw laws
verify` CLI twin, and the CI orchestrator `speclaw verify` (exit codes, SARIF,
markdown, GitHub workflow). Two verification surfaces share one model and one
scope matcher but carry different backend sets by design: the **action-time**
surface (`speclaw_check`, on the keystroke latency budget) evaluates the `path`
backend only; the **batch** surface (`law_verify` / `speclaw verify`) additionally
evaluates the graph-reading `deps` and `graph` backends. The `ast`, `process`,
`traceability`, and `semantic` backends remain declared-only and are defined by
later `executable-laws` slices.

### Requirement: Law manifest

speclaw SHALL maintain a machine-readable law manifest at
`.speclaw/laws-manifest.json`. During `init` it SHALL seed the manifest from the
package's shipped starter laws when the project has none; during `init` and
`update` it SHALL (re)compile the agent hooks from the manifest that exists.
A manifest already present SHALL NOT have its existing law entries overwritten,
so a curated manifest survives an `update`; speclaw MAY append shipped seed laws
whose `id` is absent. When the manifest file is missing at verify time (a clean
CI clone), the batch verifier SHALL evaluate the shipped seed in memory rather
than report an empty pass. Each law SHALL carry `id`, `title`, `prose`,
`severity`, `scope` (globs), `verification`, `enforcement`, and `source` (file,
optional line). A law whose `verification.kind` is `deps` or `graph` SHALL
additionally carry a validated rule payload; a law whose `verification` names a
backend that is neither `path` nor evaluated by the batch surface SHALL be
written to the manifest but SHALL NOT be evaluated at runtime. The shipped seed
SHALL include architecture `deps` laws whose rule payload sets
`edgeKinds: ["import"]` (so call-graph name collisions are not findings) and a
`graph` law forbidding circular module dependencies.

#### Scenario: The manifest is seeded on init
- Given a project being initialized that has no law manifest
- When `init` completes
- Then `.speclaw/laws-manifest.json` exists and contains the shipped starter
  laws, each with its `id`, `scope`, `verification`, `enforcement`, and `source`

#### Scenario: A curated manifest is preserved on update
- Given a project whose `.speclaw/laws-manifest.json` already exists
- When `update` runs
- Then speclaw SHALL recompile the hooks from that manifest
- And SHALL NOT overwrite existing law entries
- And SHALL append any shipped seed law whose `id` is not already present

#### Scenario: Missing manifest falls back to the shipped seed
- Given a project with no `.speclaw/laws-manifest.json`
- And the shipped seed declares at least one `deps` or `graph` law
- When `law_verify` / `speclaw verify` runs without an index
- Then those batch seed laws SHALL appear in `skipped` with reason `no-index`
- And `summary.passed` SHALL NOT treat the missing manifest as a clean pass of
  zero laws when the seed has batch laws

#### Scenario: Seed architecture deps laws consider import edges only
- Given the shipped seed includes `deps` laws forbidding `src/shared` →
  `src/modules`/`src/cli` and `src/modules/compass` → `src/modules/foundation`
- When those laws are evaluated
- Then they SHALL consider only `import` edges (`edgeKinds: ["import"]`)
- And a call-graph name collision (e.g. `JSON.parse` resolving to an unrelated
  `parse` symbol) SHALL NOT be reported as a finding

#### Scenario: A law with an unimplemented backend is declared but inert
- Given a law whose `verification` is `ast` (a backend not implemented yet)
- When `speclaw_check` evaluates a matching action, and when `law_verify` runs
- Then that law SHALL NOT contribute to the action verdict
- And `law_verify` SHALL NOT count it as passed, failed, skipped, or unknown
- And `doctor` SHALL list it as declared without a backend yet

### Requirement: Hook generation

speclaw SHALL generate agent hook configuration from the manifest during `init`
and refresh it during `update`, only for agents whose `AgentDef` declares a
`hooks` capability. For agents without that capability, speclaw SHALL write no
hook entry and SHALL state, in the command summary and in `doctor`, that
blocking laws for those agents are enforced only via `speclaw verify`.

#### Scenario: Hooks generated for a hook-capable agent
- Given a project with at least one law whose `enforcement` is `bloqueo`
- And the user selected Claude Code (a hook-capable agent) during `init`
- When `init` completes
- Then the agent's hook settings SHALL contain a `PreToolUse` entry of type
  `mcp_tool` with `server` `speclaw` and `tool` `speclaw_check`
- And the generated entry SHALL be recorded against a baseline in `.speclaw.json`

#### Scenario: Agent without hook support
- Given the user selected only agents that do not declare a `hooks` capability
- When `init` completes
- Then no hook entry SHALL be written for those agents
- And the summary SHALL state that blocking laws are enforced only via
  `speclaw verify`, naming the affected agents

### Requirement: Idempotent hook merge

speclaw SHALL merge its hook entries into the agent's settings by identity —
every speclaw hook is `{type:"mcp_tool", server:"speclaw", tool:"speclaw_check"}`
— removing only prior entries carrying that identity before adding the freshly
compiled ones. speclaw SHALL never modify or remove an entry with a different
`server` or `type`. A refresh SHALL respect `--backup` by copying the diverged
settings file to `<file>.bak` before writing.

#### Scenario: Pre-existing user hooks are preserved
- Given an agent settings file containing a hook entry whose `server` is not
  `speclaw`
- When `update` refreshes the managed hook entries
- Then the non-speclaw entry SHALL remain present and unmodified
- And the refresh summary SHALL report that a merge occurred

#### Scenario: Re-running produces no drift
- Given a project whose speclaw hooks are already current
- When `update` runs again
- Then the set of speclaw hook entries in the settings file SHALL be unchanged

### Requirement: Action evaluation

The `speclaw_check` tool SHALL evaluate an agent action against every law whose
scope matches the action's target and return a verdict of `allow`, `warn`,
`deny`, or `escalate`, together with an `evaluated` list and an `elapsedMs`
measurement. It SHALL evaluate the `path` backend only; the graph-reading `deps`
and `graph` backends SHALL NOT run on this surface, so no index query executes on
the keystroke latency budget. The same logic SHALL be reachable from the CLI via
`speclaw check`: `--hook-payload -` reads a hook payload from stdin and emits the
agent's `hookSpecificOutput.permissionDecision`, exiting with code `2` on `deny`
and `0` otherwise (including every fail-open path); `--dry-run --path <file>`
previews the verdict without blocking; and with no flags it summarizes the
declared laws.

#### Scenario: The command-hook fallback signals a block via exit code
- Given a blocking law matching `.env`
- When `speclaw check --hook-payload -` receives a `PreToolUse` payload targeting
  `.env` on stdin
- Then it SHALL print `hookSpecificOutput` with `permissionDecision` `deny`
- And it SHALL exit with code `2`

#### Scenario: A blocking law denies a matching action
- Given a law `law~no-secrets-in-repo~1` with `enforcement` `bloqueo`, backend
  `path`, and scope `**/.env`
- When `speclaw_check` is invoked with event `PreToolUse` and a payload
  targeting `config/.env`
- Then the verdict SHALL be `deny`
- And the returned reason SHALL contain the law id, the law's literal prose, and
  its source file path

#### Scenario: Out-of-scope laws are not evaluated
- Given a law scoped to `src/frontend/**`
- When `speclaw_check` is invoked with a payload targeting `src/backend/api.ts`
- Then `evaluated` SHALL NOT contain that law

#### Scenario: A graph backend never runs on the action path
- Given a law whose `verification.kind` is `deps`
- When `speclaw_check` is invoked with a payload matching the law's scope
- Then that law SHALL NOT contribute to the verdict
- And no index database query SHALL be performed during the check

#### Scenario: Evaluator failure fails open
- Given the law manifest is missing or unparseable
- When `speclaw_check` is invoked with event `PreToolUse`
- Then the verdict SHALL be `allow`
- And the result SHALL carry a diagnostic message describing the failure

#### Scenario: PreToolUse latency stays within budget
- Given a project with 50 declared laws
- When `speclaw_check` is invoked 100 times with event `PreToolUse`
- Then the p99 of `elapsedMs` SHALL be under 15

### Requirement: Deterministic batch verification

speclaw SHALL provide a batch verifier, exposed as the `law_verify` MCP tool and
the `speclaw laws verify` CLI twin, that evaluates every law whose
`verification.kind` is a deterministic batch backend (`deps` or `graph`) without
invoking a language model, and returns a `VerifyReport`. The report's `summary`
SHALL distinguish four states — `passed`, `failed`, `skipped`, `unknown` — each
law SHALL fall into exactly one, and no code path SHALL count a skipped or
unknown law as passed. Every entry in `skipped` SHALL carry a machine-readable
reason. The verifier SHALL accept an optional `paths` filter, an optional
`engines` filter, and an optional `lawIds` filter, and both transports SHALL
delegate to one shared core. Because a missing index skips every batch law at
once, `skipped: no-index` is exercised by the missing-index scenario below rather
than alongside evaluated laws.

#### Scenario: Passed, failed, and unknown are distinguished in one run
- Given an indexed project with one `deps` law that no edge violates, one `deps`
  law that a resolved edge violates, and one `deps` law whose only in-scope edges
  are unresolved
- When `law_verify` runs
- Then `summary.passed`, `summary.failed`, and `summary.unknown` SHALL each
  account for the corresponding law
- And the sum of `passed`, `failed`, `skipped`, and `unknown` SHALL equal the
  number of laws evaluated, so no law appears in more than one terminal count

#### Scenario: Missing index does not silently pass graph laws
- Given a project with no `.speclaw/index.db`
- When `law_verify` runs
- Then every `deps` and `graph` law SHALL appear in `skipped` with reason
  `no-index`
- And `summary.passed` SHALL NOT include those laws
- And the skip reason SHALL name the command that builds the index

#### Scenario: Engine filter restricts what runs
- Given a project with both `deps` and `graph` laws
- When `law_verify` runs with `engines` set to `["deps"]`
- Then no `graph` law SHALL be evaluated
- And the `graph` laws SHALL NOT appear in `summary.passed` or `summary.failed`

#### Scenario: Both transports return the same result
- Given a fixed project state
- When `law_verify` is invoked and `speclaw laws verify` is run against it
- Then the `VerifyReport` produced by each SHALL be equivalent

### Requirement: Dependency backend

speclaw SHALL evaluate a `deps` law at file granularity over the existing Compass
index (`edges`, `nodes`, `files`), resolving each edge's `dst_node_id` to its
file. A `type: forbidden` rule SHALL produce a finding for every resolved edge
whose source path matches `from` and whose destination path matches `to`; a
`type: required` rule SHALL produce a finding for every source matching `from`
that has no resolved edge to any destination matching `to`. The backend SHALL
support group matching so a capture in `from` is referenceable as `$1` in `to`.
Each finding SHALL carry the law id, the source file path, and the source line of
the offending edge. An edge inside the law's scope whose `dst_node_id` is null
SHALL be counted as `unknown`, never as a pass.

#### Scenario: Forbidden dependency is detected with provenance
- Given an index containing a resolved edge from a file matching `^src/domain/`
  to a file matching `^src/infra/`
- And a `deps` law forbidding that dependency
- When `law_verify` runs
- Then the report SHALL contain a finding for that law
- And the finding SHALL carry the source file path and the source line of the
  edge

#### Scenario: Group matching forbids cross-feature imports with one rule
- Given files under `src/features/a/` and `src/features/b/`
- And a resolved edge from `src/features/a/x.ts` to `src/features/b/y.ts`
- And a `deps` law with `from` `^src/features/([^/]+)/` and `to`
  `^src/features/` excluding `^src/features/$1/`
- When `law_verify` runs
- Then the report SHALL contain a finding for the a→b edge

#### Scenario: Unresolved edges are reported as unknown, not passed
- Given an index containing an edge with a null destination node inside a `deps`
  law's scope
- When `law_verify` runs
- Then the report SHALL include an `unknown` entry naming the law and the count
  of unresolved references
- And that law SHALL NOT be counted in `summary.passed`

### Requirement: Graph backend

speclaw SHALL evaluate a `graph` law over the Compass index for dependency cycles
and transitive reachability, at file granularity. Cycle detection SHALL use an
iterative strongly-connected-component algorithm that does not overflow the stack
on deep import chains, and SHALL report the minimal cycle found inside a component
rather than the whole component, while reporting the enclosing component's size as
additional detail. An intra-file self-dependency (an edge whose source and
destination file are the same) SHALL be excluded from the graph and SHALL NOT be
reported as a cycle violation — at file granularity it is not a cycle.

#### Scenario: Minimal cycle is reported instead of the whole component
- Given a strongly connected component of eight files containing a three-file
  cycle
- And a `graph` law forbidding circular dependencies
- When `law_verify` runs
- Then the finding SHALL list the three-file cycle
- And it SHALL report the size of the enclosing component as additional detail

#### Scenario: Intra-file self-dependency is not a cycle
- Given a file with a resolved edge to itself, and an acyclic cross-file edge
- And a `graph` law forbidding circular dependencies
- When `law_verify` runs
- Then no cycle finding SHALL be produced

#### Scenario: Cycle detection survives deep import chains
- Given an index whose import graph contains a chain deep enough to overflow a
  recursive traversal
- When `law_verify` runs a `graph` cycle law
- Then verification SHALL complete without a stack overflow

### Requirement: Discriminated law verification model

speclaw SHALL model `verification` as a discriminated union on `kind`, extending
— never replacing — the existing model. The `deps` and `graph` kinds SHALL each
carry a rule payload validated by the manifest schema; the `path`, `none`, and
not-yet-implemented kinds SHALL remain payload-free. A manifest entry written by a
previous version whose `verification` is `{ "kind": "path" }` SHALL continue to
validate unchanged. An invalid `from`/`to` regex or a malformed rule payload SHALL
be rejected when the manifest is validated, not at verification time.

#### Scenario: A deps rule payload is validated
- Given a law whose `verification` is `{ kind: "deps", rule: { from, to, type } }`
- When the manifest is validated
- Then validation SHALL succeed and the payload SHALL be available to the `deps`
  engine

#### Scenario: A legacy path law still validates
- Given a manifest entry whose `verification` is exactly `{ "kind": "path" }`
- When the manifest is read and validated
- Then validation SHALL succeed and the law SHALL evaluate on the action path as
  before

#### Scenario: A malformed rule payload is rejected at validation time
- Given a `deps` law whose `from` is not a valid regular expression
- When the manifest is validated
- Then validation SHALL fail naming the law id and the offending field

### Requirement: Context coverage audit

speclaw SHALL record which laws were loaded into agent context and report the
coverage in `doctor`. The report SHALL name laws that were not loaded and SHALL
state that a `paths:`-scoped rule is not re-injected after a `compact` until a
matching file is next touched.

#### Scenario: Loaded laws are recorded
- Given hooks are installed
- When `speclaw_check` is invoked with event `InstructionsLoaded` for a file
  declaring two laws
- Then both law ids SHALL be appended to the context log with a timestamp

#### Scenario: Doctor reports missing coverage
- Given a context log in which 10 of 14 declared laws appear
- When `speclaw doctor` runs
- Then the output SHALL report 10 of 14 laws loaded
- And it SHALL name the 4 laws that were not loaded

### Requirement: Glob validation

speclaw SHALL reject an invalid law scope glob at generation time rather than at
runtime, so a malformed glob never silently matches zero files during
enforcement. (A malformed `deps`/`graph` `from`/`to` regex is rejected earlier,
when the manifest is validated — see the model requirement above.) speclaw SHALL
also report, in `doctor`, whether the Compass index needed by the `deps`/`graph`
engines is present.

#### Scenario: Malformed glob is caught at generation time
- Given a law whose scope contains an unclosed bracket
- When `init` or `doctor` runs
- Then the command SHALL report the law id and the malformed pattern
- And `init` SHALL NOT write a hook entry for that law

#### Scenario: Doctor reports graph-engine availability
- Given a scaffolded project that declares at least one `deps` or `graph` law
  and has no Compass index
- When `doctor` runs
- Then it SHALL report that those laws will be skipped and SHALL name the command
  that builds the index

### Requirement: CI verification command

speclaw SHALL provide a `verify` command that evaluates the project's
deterministic batch laws without invoking a language model and communicates its
result through a documented exit code. `--ci` SHALL disable color and SHALL
treat a shallow clone as an insufficient environment. An unwritable `--sarif`
or `--json` output path SHALL also be an insufficient environment (exit code
`3`). `--fail-on` SHALL default to `error`. `--strict-engines` SHALL turn any
`skipped` law into exit code `4`. The same `verifyLaws` core SHALL back
`speclaw laws verify` and `law_verify`.

#### Scenario: Conforming project exits zero
- Given a project whose batch laws produce no findings at or above `--fail-on`
- And no batch law was skipped
- When `speclaw verify --ci` runs
- Then the process SHALL exit with code 0

#### Scenario: New violation exits one
- Given a project with one `deps` or `graph` finding of severity `error`
- When `speclaw verify --ci` runs with the default fail threshold
- Then the process SHALL exit with code 1
- And the output SHALL name the law id, the file and the line

#### Scenario: Incomplete verification is distinguishable from success
- Given at least one batch law skipped with reason `no-index`
- When `speclaw verify --ci --strict-engines` runs and no findings were produced
- Then the process SHALL exit with code 4
- And the output SHALL list each unevaluated law with its reason

#### Scenario: Shallow clone under --ci exits three
- Given a shallow git clone
- When `speclaw verify --ci` runs
- Then the process SHALL exit with code 3
- And the output SHALL mention `fetch-depth: 0`

#### Scenario: Unwritable SARIF path exits three
- Given `--sarif` points at a path whose parent directory does not exist
- When `speclaw verify` runs
- Then the process SHALL exit with code 3

#### Scenario: Unknown flag combination exits two
- Given an invocation with `--fail-on` set to a value other than
  `error`, `warn`, or `info`
- When `speclaw verify` runs
- Then the process SHALL exit with code 2

### Requirement: SARIF output

speclaw SHALL emit SARIF 2.1.0 describing every finding, with one SARIF rule per
loaded law, repository-relative locations, and a stable local fingerprint
`lawId:file:line`. Skipped laws SHALL appear as `toolExecutionNotifications`.
More than 5.000 findings SHALL be truncated by severity, with a notification of
how many were dropped. No `artifactLocation.uri` SHALL be absolute.

#### Scenario: SARIF declares one rule per loaded law
- Given a project whose loaded manifest has three laws, two of which produce
  findings
- When `speclaw verify --ci --sarif out.sarif` runs
- Then `out.sarif` SHALL contain three entries in `runs[0].tool.driver.rules`
- And each entry SHALL carry the law's title and prose

#### Scenario: Locations are repository-relative
- Given speclaw runs from an absolute working directory
- When SARIF is emitted
- Then every `artifactLocation.uri` SHALL be relative to the repository root
- And no `artifactLocation.uri` SHALL begin with a path separator or a drive
  letter

#### Scenario: Skips are visible in the SARIF run
- Given at least one batch law skipped with reason `no-index`
- When SARIF is emitted
- Then `runs[0].invocations[0].toolExecutionNotifications` SHALL contain a
  warning naming that law and reason

### Requirement: Deterministic markdown report

The markdown report SHALL list law findings with file and line, SHALL list
skipped laws with their reason, and SHALL NOT assert that any requirement is
covered. When `$GITHUB_STEP_SUMMARY` is set, speclaw SHALL append the markdown
report to that file.

#### Scenario: Coverage claims require traceability data
- Given traceability annotations are absent from the project
- When the markdown report is generated
- Then the report SHALL NOT assert that any requirement is covered

### Requirement: CI workflow security defaults

The workflow template that speclaw writes (when
`.github/workflows/speclaw.yml` does not already exist) SHALL not grant the
verification job access to repository secrets, SHALL request the minimum
permissions per job, SHALL check out with `fetch-depth: 0`, and SHALL NOT use
`pull_request_target`. `init` and `update` SHALL write the file only when it is
missing.

#### Scenario: Template does not use pull_request_target
- Given the generated workflow template
- When it is inspected
- Then it SHALL NOT contain a `pull_request_target` trigger

#### Scenario: Permissions are denied by default
- Given the generated workflow template
- When it is inspected
- Then the workflow-level `permissions` SHALL be empty
- And the verification job SHALL declare only `contents: read` and
  `security-events: write`

#### Scenario: Existing workflow is left untouched
- Given a project whose `.github/workflows/speclaw.yml` already exists
- When `init` or `update` runs
- Then that file SHALL NOT be overwritten

#### Scenario: Missing workflow is created
- Given a project with no `.github/workflows/speclaw.yml`
- When `init` or `update` runs
- Then the file SHALL be written from the shipped template
