# Law enforcement

Runtime enforcement of a project's declared laws through agent hooks, plus
compilation of those laws into agent rule dialects (AGENTS / Claude / Cursor /
Copilot / CodeRabbit) and optional import of third-party rule files as draft
laws. speclaw compiles the laws into hook configuration for hook-capable agents,
evaluates a pending or completed agent action against the laws whose scope
matches, and returns a verdict that can block the action. This capability
governs the `Law` model and `.speclaw/laws-manifest.json`, dialect compilation,
`speclaw_check` / `speclaw check`, the hook compiler, `AgentDef`, the
context-coverage audit, glob validation, `law_verify` / `speclaw laws verify`,
and the CI orchestrator `speclaw verify`. Two verification surfaces share one
model and one scope matcher but carry different backend sets by design: the
**action-time** surface evaluates the `path` backend only; the **batch** surface
additionally evaluates `deps` and `graph`. The `ast`, `process`, `traceability`,
and `semantic` backends remain declared-only for enforcement (semantic is used
for imported draft laws that do not gate).

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

Every speclaw `mcp_tool` hook SHALL include an `input` object that Claude Code
can substitute from the hook event JSON, supplying at least `projectPath`
(`${cwd}`), `event` (`${hook_event_name}`), and a `payload` object carrying
substituted `hook_event_name`, `tool_name`, and `tool_input.file_path` fields
needed by `speclaw_check`. speclaw SHALL NOT rely on the host auto-injecting
those arguments.

#### Scenario: Hooks generated for a hook-capable agent
- Given a project with at least one law whose `enforcement` is `bloqueo`
- And the user selected Claude Code (a hook-capable agent) during `init`
- When `init` completes
- Then the agent's hook settings SHALL contain a `PreToolUse` entry of type
  `mcp_tool` with `server` `speclaw` and `tool` `speclaw_check`
- And that entry's `input.projectPath` SHALL be `${cwd}`
- And that entry's `input.event` SHALL be `${hook_event_name}`
- And that entry's `input.payload` SHALL include a substituted
  `tool_input.file_path` path
- And the generated entry SHALL be recorded against a baseline in `.speclaw.json`

#### Scenario: Update rewrites hooks that lacked input
- Given a project whose Claude settings already contain speclaw `mcp_tool`
  hooks without an `input` field (pre-0.3.7 shape)
- When `speclaw update` / a managed refresh runs
- Then those speclaw hook entries SHALL be replaced with entries that include
  the required `input` template
- And non-speclaw hook entries SHALL remain unmodified

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

### Requirement: CI verification includes structural drift findings

When committed anchors exist, `speclaw verify --ci` SHALL evaluate structural
spec↔code drift and SHALL emit semantic and deleted findings into the same
SARIF/report stream as law findings, using a stable rule id under the drift
namespace. Absence of anchors SHALL NOT fail verification. Cosmetic and moved
verdicts SHALL NOT fail the default `--fail-on error` threshold.

#### Scenario: Semantic drift appears in SARIF
- Given sealed anchors with a `changed-semantic` finding
- When `speclaw verify --ci --sarif out.sarif` runs
- Then `out.sarif` SHALL include a drift finding for that anchor

#### Scenario: No anchors leaves verify unaffected
- Given a project with no `lawbook/anchors/` files and no law findings
- When `speclaw verify --ci` runs
- Then the process SHALL exit `0` with respect to drift

### Requirement: Optional draft status on laws

A law MAY carry `status` of `active` (default when omitted) or `draft`. Batch
verification (`law_verify` / `speclaw verify`) SHALL NOT treat `draft` laws as
failures or as required passes; they MAY appear in a pending/draft count.
Action-time `speclaw_check` SHALL ignore `draft` laws for blocking verdicts.

#### Scenario: Draft laws do not fail verify
- Given a manifest containing a law with `status: draft` that would otherwise fail
- When `speclaw verify` runs
- Then the exit code SHALL NOT be non-zero solely because of that law
- And the report SHALL count it as pending human approval (or equivalent)

### Requirement: Parse laws from standards documents

speclaw SHALL be able to extract candidate laws from `docs/standards/*.md`
(stable `law~…~N` ids, prose, scope when declared, `source` file/line) and merge
them into the working set used by compilation. Duplicate ids across sources
SHALL fail loudly. Manifest entries with the same `id` SHALL take precedence
over parsed candidates unless an explicit refresh-from-standards mode is used.

#### Scenario: Standards yield mergeable laws
- Given a standards file declaring a law id not present in the manifest
- When compilation runs
- Then that law SHALL be included in the compiled dialect outputs

#### Scenario: Duplicate ids fail the parse
- Given two standards sections that claim the same law id
- When parse/compile runs
- Then the command SHALL exit non-zero naming the id and both sources

### Requirement: Multidialect law compilation

speclaw SHALL compile the active law set into agent rule dialects: AGENTS.md
(delimited degrade), Claude Code rules under `ai-specs/rules` with `paths:`
(and a project symlink `.claude/rules/speclaw` when Claude is configured),
Cursor rules as `.mdc` under `ai-specs/rules` with `globs`/`alwaysApply`,
GitHub Copilot `.github/instructions/*.instructions.md` with `applyTo`, and a
best-effort CodeRabbit `.coderabbit.yaml` merge of `path_instructions` marked
`[speclaw:law~…]`. Compilation SHALL be deterministic and idempotent (second
run reports unchanged without touching mtimes of identical bytes). Foreign
rule files speclaw does not manage SHALL be left intact. Path-scoped dialect
bodies SHALL omit `rationale`. Invalid scopes SHALL fail at compile time using
the same glob validator as hooks.

#### Scenario: Unchanged second compile is a no-op
- Given a project already compiled
- When `speclaw laws compile` runs again with no law changes
- Then every managed artifact action SHALL be `unchanged`
- And file mtimes of identical artifacts SHALL NOT be modified

#### Scenario: Claude rules use paths frontmatter
- Given an active law with scope `src/domain/**` and Claude configured
- When compilation runs
- Then a rule file under `ai-specs/rules/` SHALL include frontmatter `paths`
  containing that glob

#### Scenario: Cursor rules use globs frontmatter
- Given the same law and Cursor configured
- When compilation runs
- Then a `.mdc` under `ai-specs/rules/` SHALL include `globs` for that scope
- And `alwaysApply` SHALL be false for non-empty scope

#### Scenario: AGENTS delimited block degrades scope into prose
- Given a scoped law and a personalized `AGENTS.md`
- When compilation runs
- Then only the speclaw-delimited block SHALL be rewritten
- And the degraded prose SHALL mention the law's globs
- And user text outside the markers SHALL remain

#### Scenario: Copilot does not dual-emit the same scoped law
- Given a scoped law and Copilot among targets
- When compilation runs
- Then that law's scoped body SHALL appear in `.github/instructions/`
- And SHALL NOT be duplicated as a full scoped body inside the AGENTS block

#### Scenario: CodeRabbit merge preserves foreign keys
- Given a `.coderabbit.yaml` with keys outside `reviews.path_instructions`
- When compilation runs
- Then those keys SHALL retain their values
- And only speclaw-marked path_instructions entries SHALL be added/updated/removed

#### Scenario: Nested AGENTS for dense package prefixes
- Given ≥3 active laws sharing a directory prefix that contains `package.json`
- When compilation runs
- Then a nested `AGENTS.md` MAY be emitted in that directory
- And the root AGENTS block SHALL mention nested files

### Requirement: Import third-party rules as draft laws

speclaw SHALL import rules from selected third-party layouts (at least rulesync)
into the Law model with `verification.kind: semantic`, `severity: warn`, and
`status: draft`, without treating them as verified gates until a human activates
them.

#### Scenario: Importing rulesync output
- Given a repository containing rulesync-managed rule files
- When `speclaw laws import --from rulesync` runs
- Then each imported rule SHALL become a draft law with semantic verification
- And `speclaw verify` SHALL NOT fail solely due to those draft laws

### Requirement: Always-on law token budget in doctor

`speclaw doctor` SHALL estimate tokens for laws with empty scope (always-on) and
SHALL warn when the estimate exceeds 2000, naming the three most expensive
always-on laws. The estimate MAY use a documented bytes-per-token heuristic.

#### Scenario: Always-on budget exceeded
- Given empty-scope laws whose estimated cost exceeds 2000 tokens
- When `speclaw doctor` runs
- Then the output SHALL report the estimated total
- And it SHALL name up to three most expensive always-on laws

### Requirement: Committed rule lockfile `req~speclaw-lock~1`

WHEN speclaw generates or refreshes rule artifacts, the system SHALL record
sha256 digests in a committed `speclaw.lock` at the repository root. speclaw
SHALL NOT place the lockfile under `.speclaw/`. Digests SHALL be computed from
canonical bytes (LF endings, provenance block excluded, trailing whitespace
trimmed).

Needs: impl, utest
Status: approved

#### Scenario: Lockfile created with baseline
- Given a project with no `speclaw.lock`
- When `speclaw laws lock` (or init that writes rule files) completes
- Then `speclaw.lock` SHALL exist at the repository root
- And it SHALL NOT be listed in `.gitignore`
- And it SHALL contain digests for tracked rule files

#### Scenario: Line endings do not change digests
- Given two byte sequences that differ only by CRLF versus LF
- When each is canonicalized and hashed
- Then the digests SHALL be identical

#### Scenario: Provenance block is excluded from digests
- Given a generated rule file containing a speclaw provenance comment block
- When the file is regenerated and hashed again
- Then the digest SHALL be unchanged
- And the provenance block SHALL appear exactly once

### Requirement: Integrity verification in verify pipeline `req~integrity-verify~1`

WHEN `speclaw verify` runs and a `speclaw.lock` is present, the system SHALL
compare lock entries to files on disk via `verifyIntegrity` (distinct from
deps/graph `verifyLaws`). WHILE a path is classified `strict` (including
`AGENTS.md`, `CLAUDE.md`, and compiled dialect rules), a digest mismatch,
missing file, or redirected managed symlink SHALL fail verification. WHILE a
path is classified `advisory` (including `docs/standards/**`), a mismatch
SHALL warn without forcing a failing exit by itself. WHEN no lockfile exists,
verification SHALL exit successfully regarding integrity and SHALL instruct how
to create a baseline.

Needs: impl, utest
Status: approved

#### Scenario: Modified AGENTS.md fails verify
- Given a lockfile digest for `AGENTS.md`
- And the file was modified outside the speclaw pipeline
- When `speclaw verify` runs
- Then the exit code SHALL be non-zero
- And the report SHALL name expected and actual digests

#### Scenario: Modified standards doc warns only
- Given a lockfile digest for a `docs/standards/*.md` file marked advisory
- And that file was modified
- When `speclaw verify` runs
- Then integrity alone SHALL NOT force a failing exit
- And a warning SHALL name the file

#### Scenario: Missing lockfile is soft
- Given a project with no `speclaw.lock`
- When `speclaw verify` runs
- Then integrity SHALL NOT fail the run solely for the missing lock
- And the report SHALL explain how to create the baseline

### Requirement: Injection scanning of rules and skills `req~injection-scan~1`

WHEN integrity or scan runs, speclaw SHALL scan rule files and skill/pack
prose for prompt-injection patterns after Unicode normalization, independently
of digest matching. speclaw SHALL include skill descriptions that inject into
agent context even when not invoked. Accepting a digest SHALL NOT suppress
error-severity scan findings.

Needs: impl, utest
Status: approved

#### Scenario: Instruction override detected
- Given a rule file containing text instructing the agent to ignore previous
  instructions
- When scanning runs
- Then a finding with detector `injection/instruction-override` and severity
  `error` SHALL be reported with path and line

#### Scenario: Skill pack prose is scanned
- Given a skill description containing an exfiltration instruction
- When scanning runs
- Then the finding SHALL be reported even if the skill was never invoked

#### Scenario: Accept does not clear scan errors
- Given a managed file whose digest was accepted
- And the file still triggers an error-severity injection detector
- When `speclaw verify` runs
- Then the exit code SHALL be non-zero

### Requirement: Human-only lock acceptance `req~laws-accept-human~1`

WHEN a user updates a recorded digest, speclaw SHALL require interactive TTY
confirmation via `speclaw laws accept`. speclaw SHALL NOT expose digest
acceptance over MCP. WHEN accept runs without a TTY, the command SHALL fail
without writing the lockfile.

Needs: impl, utest
Status: approved

#### Scenario: No MCP tool mutates the lock
- Given an MCP client listing tools
- When tools are enumerated
- Then no tool SHALL update `speclaw.lock`
- And no new integrity-only MCP tool SHALL be required for this change

#### Scenario: Accept without TTY fails
- Given a non-interactive environment
- When `speclaw laws accept` is invoked
- Then the command SHALL exit non-zero
- And the lockfile SHALL be unchanged
