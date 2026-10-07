# Law enforcement

Runtime enforcement of a project's declared laws through agent hooks, plus
compilation of those laws into agent rule dialects (AGENTS / Claude / Cursor /
Copilot / CodeRabbit) and optional import of third-party rule files as draft
laws. speclaw compiles the laws into hook configuration for hook-capable agents,
evaluates a pending or completed agent action against the laws whose scope
matches, and returns a verdict that can block the action. The same action-time
check also carries an advisory Compass-first nudge on `PostToolUse` for
`Read`/`Grep`/`Glob`, which injects context only and never gates. The hook
compiler also installs one `SessionStart` command hook that silently refreshes
an existing Compass index; it evaluates no law and never fails the session. This capability
governs the `Law` model and `.speclaw/laws-manifest.json`, dialect compilation,
`speclaw_check` / `speclaw check`, the hook compiler, `AgentDef`, the
context-coverage audit, glob validation, `law_verify` / `speclaw laws verify`,
and the CI orchestrator `speclaw verify`. Two verification surfaces share one
model and one scope matcher but carry different backend sets by design: the
**action-time** surface evaluates the `path` backend only; the **batch** surface
additionally evaluates `deps` and `graph`. The `ast`, `process`, `traceability`,
and `semantic` backends remain declared-only for enforcement (semantic is used
for imported draft laws that do not gate). A lock refresh never re-baselines a
strict rule file that drifted from `speclaw.lock`; only a human at an
interactive terminal (`laws accept`, `laws lock --force`) moves a drifted
strict digest.

### Requirement: Law manifest `req~adapt-seed-to-repo~1`

speclaw SHALL maintain a machine-readable law manifest at
`.speclaw/laws-manifest.json`. During `init` it SHALL seed the manifest from the
package's shipped starter laws **adapted to the target repository** when the
project has none; during `init` and `update` it SHALL (re)compile the agent
hooks from the manifest that exists. A catalog law SHALL be seeded only when
every path in its `requires` list exists in the project (an empty `requires`
means the law is portable). The cycle graph law SHALL have its `scope` rewritten
to detected source roots (`apps/*/src/**`, `packages/*/src/**`, `src/**`,
`lib/**`) WHEN the catalog default globs match nothing, SHALL exclude test
paths from that scope, and SHALL set `edgeKinds: ["import"]`. A manifest already
present SHALL NOT have its existing law entries overwritten, so a curated
manifest survives an `update`; speclaw MAY append adapted seed laws whose `id`
is absent, SHALL remove an unmodified shipped law whose required paths are
absent, and SHALL replace an unmodified cycle law with the adapted scope when
the catalog default paths are absent. WHEN the manifest file is missing at
verify time (a clean CI clone), the batch verifier SHALL evaluate the
**adapted** seed in memory rather than report an empty pass or inject
inapplicable dogfood laws. Each law SHALL carry `id`, `title`, `prose`,
`severity`, `scope` (globs), `verification`, `enforcement`, and `source` (file,
optional line). A law whose `verification.kind` is `deps` or `graph` SHALL
additionally carry a validated rule payload; a law whose `verification` names a
backend that is neither `path` nor evaluated by the batch surface SHALL be
written to the manifest but SHALL NOT be evaluated at runtime. The shipped
catalog SHALL include architecture `deps` laws whose rule payload sets
`edgeKinds: ["import"]` (so call-graph name collisions are not findings) and a
`graph` law forbidding circular module dependencies; those dogfood laws SHALL
NOT appear in a consumer that lacks the referenced trees.

Needs: impl, utest
Status: proposed

#### Scenario: The manifest is seeded on init from the target repo
- Given a project being initialized that has no law manifest
- And the project has no `src/modules/` tree and no `ATTRIBUTION.md`
- When `init` completes
- Then `.speclaw/laws-manifest.json` exists and contains portable laws such as
  `law~no-secrets-in-repo~1`, each with its `id`, `scope`, `verification`,
  `enforcement`, and `source`
- And it SHALL NOT contain speclaw-dogfood laws whose required paths are absent
  (`law~compass-does-not-import-foundation~1`, `law~honest-attribution~1`,
  `law~protect-templates~1`, `law~local-first~1`, `law~shared-stays-inner~1`)

#### Scenario: Cycle-law scope follows detected source roots
- Given a project whose source lives under `apps/backend/src/` and which has no
  `src/modules/`
- When `init` seeds the manifest
- Then `law~no-module-cycles~1` SHALL be present with a scope matching
  `apps/*/src/**`
- And that scope SHALL exclude test files (`*.spec.*`, `*.test.*`, `test/`,
  `__tests__/`)
- And the graph rule SHALL set `edgeKinds: ["import"]`

#### Scenario: Speclaw-shaped repos still receive dogfood laws
- Given a project that contains `src/modules/compass`, `src/modules/foundation`,
  `src/shared`, and `src/cli`
- When `init` seeds the manifest
- Then the architecture `deps` laws and the cycle law SHALL be present

#### Scenario: A curated manifest is preserved on update
- Given a project whose `.speclaw/laws-manifest.json` already exists
- When `update` runs
- Then speclaw SHALL recompile the hooks from that manifest
- And SHALL NOT overwrite existing customized law entries
- And SHALL append any adapted seed law whose `id` is not already present
- And SHALL remove an unmodified shipped seed law whose required paths are absent
- And SHALL replace an unmodified cycle law with the adapted scope when the
  catalog default paths are absent

#### Scenario: Missing manifest falls back to the adapted seed
- Given a project with no `.speclaw/laws-manifest.json`
- And the project's layout satisfies at least one shipped batch law's required
  paths
- When `law_verify` / `speclaw verify` runs without an index
- Then those applicable batch seed laws SHALL appear in `skipped` with reason
  `no-index`
- And inapplicable dogfood batch laws SHALL NOT appear in the report
- And `summary.passed` SHALL NOT treat the missing manifest as a clean pass of
  zero laws when the adapted seed has batch laws

#### Scenario: Seed architecture deps laws consider import edges only
- Given the shipped catalog includes `deps` laws forbidding `src/shared` →
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

For every hook-capable agent, speclaw SHALL also write one `PostToolUse` entry
with matcher `Read|Grep|Glob` that calls `speclaw_check` for the Compass-first
nudge, regardless of whether the manifest declares any law. speclaw SHALL NOT
write a `PreToolUse` entry for the nudge.

Every speclaw `mcp_tool` hook SHALL include an `input` object that Claude Code
can substitute from the hook event JSON, supplying at least `projectPath`
(`${cwd}`), `event` (`${hook_event_name}`), and a `payload` object carrying
substituted `hook_event_name`, `tool_name`, `tool_input.file_path`,
`tool_input.path`, `tool_input.pattern`, `tool_input.glob`, and
`tool_input.type` fields needed by `speclaw_check`.
speclaw SHALL NOT rely on the host auto-injecting those arguments.

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

#### Scenario: The Compass nudge entry is installed without laws
- Given a project whose manifest declares no law
- And the user selected Claude Code during `init`
- When `init` completes
- Then the agent's hook settings SHALL contain a `PostToolUse` entry with
  matcher `Read|Grep|Glob`, type `mcp_tool`, `server` `speclaw`, and `tool`
  `speclaw_check`
- And its `input.payload.tool_input` SHALL carry `${tool_input.file_path}`,
  `${tool_input.path}`, `${tool_input.pattern}`, `${tool_input.glob}`, and
  `${tool_input.type}`
- And no `PreToolUse` entry SHALL match `Read`, `Grep`, or `Glob`

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

speclaw SHALL merge its hook entries into the agent's settings by identity,
removing only prior entries that carry a speclaw identity before adding the
freshly compiled ones. A hook SHALL carry a speclaw identity when it is an
`mcp_tool` hook with `server` `speclaw` and `tool` `speclaw_check`, or a
`command` hook whose `command` contains the marker
`speclaw session-start` (or the pre-release marker
`speclaw index --session-start`, so an entry written by a 2.0.7 pre-release
build is replaced rather than duplicated). speclaw SHALL never modify or remove a hook
that carries neither identity, and SHALL write no key into the settings file
beyond those the agent's hook schema defines. A refresh SHALL respect
`--backup` by copying the diverged settings file to `<file>.bak` before
writing.

#### Scenario: Pre-existing user hooks are preserved
- Given an agent settings file containing a hook entry whose `server` is not
  `speclaw`
- When `update` refreshes the managed hook entries
- Then the non-speclaw entry SHALL remain present and unmodified
- And the refresh summary SHALL report that a merge occurred

#### Scenario: A user SessionStart command hook is preserved
- Given an agent settings file containing a `SessionStart` `command` hook whose
  `command` does not contain `speclaw session-start`
- When `update` refreshes the managed hook entries
- Then that user hook SHALL remain present and unmodified
- And the speclaw `SessionStart` entry SHALL be present alongside it

#### Scenario: Re-running produces no drift
- Given a project whose speclaw hooks are already current
- When `update` runs again
- Then the set of speclaw hook entries in the settings file SHALL be unchanged
- And the settings file SHALL contain exactly one speclaw `SessionStart` hook

### Requirement: Session-start index hook `req~session-start-hook~1`

WHEN speclaw generates or refreshes hook configuration for an agent whose
`AgentDef` declares a `hooks` capability, speclaw SHALL write one
`SessionStart` entry with matcher `startup|resume|clear|compact` whose single
hook has type `command`, a `timeout` of 30 seconds, and a POSIX shell command
that runs the top-level session-start command (`speclaw session-start`),
whether or not the manifest declares any law. The command SHALL do nothing
when `.speclaw/index.db` is absent, SHALL resolve speclaw in the order
`node_modules/.bin/speclaw`, `speclaw` on `PATH`, and
`npm_config_offline=true npx --no-install @esneiderbravo/speclaw` with
`npm_config_update_notifier=false` also set, SHALL NOT
install or download a package nor contact a package registry, SHALL invoke no
`speclaw index` subcommand (so a speclaw that does not know `session-start`
rejects it without indexing), SHALL discard its stdout and stderr, and SHALL
exit with code 0 in every case. speclaw SHALL NOT write this entry for an agent without a `hooks`
capability.

Needs: impl, utest
Status: proposed

#### Scenario: The session-start entry is installed without laws
- Given a project whose manifest declares no law
- And the user selected Claude Code during `init`
- When `init` completes
- Then the agent's hook settings SHALL contain a `SessionStart` entry with
  matcher `startup|resume|clear|compact`
- And its single hook SHALL have type `command` and `timeout` 30
- And its `command` SHALL contain `speclaw session-start`
- And its `command` SHALL contain
  `npm_config_offline=true npx --no-install @esneiderbravo/speclaw`

#### Scenario: The command does nothing without an index
- Given a directory with no `.speclaw/index.db`
- When the session-start hook command runs through `sh -c`
- Then it SHALL exit with code 0
- And stdout and stderr SHALL be empty
- And `.speclaw/index.db` SHALL NOT exist afterwards

#### Scenario: The local binary is preferred
- Given a directory with `.speclaw/index.db`
- And an executable `node_modules/.bin/speclaw` stub that records its arguments
- When the session-start hook command runs through `sh -c`
- Then the stub SHALL have been invoked with `session-start`
- And the command SHALL exit with code 0 with empty stdout and stderr

#### Scenario: An older speclaw on PATH does nothing
- Given a directory with `.speclaw/index.db` and no local binary
- And a `speclaw` stub first on `PATH` that indexes only on `index` and exits
  with code 1 on any unknown command
- When the session-start hook command runs through `sh -c`
- Then the stub SHALL have been invoked with `session-start` only
- And it SHALL NOT have indexed, and no file under `.speclaw/` SHALL change
- And the command SHALL exit with code 0 with empty stdout and stderr

#### Scenario: The npx fallback runs offline
- Given a directory with `.speclaw/index.db`, no local binary, and a `PATH`
  holding only an `npx` stub that records its arguments and environment
- When the session-start hook command runs through `sh -c`
- Then the stub SHALL have been invoked with
  `--no-install @esneiderbravo/speclaw session-start`
- And `npm_config_offline` SHALL have been `true` in its environment
- And `npm_config_update_notifier` SHALL have been `false` in its environment
- And the command SHALL exit with code 0 with empty stdout and stderr

#### Scenario: A failing refresh never fails the session
- Given a directory with `.speclaw/index.db`
- And an executable `node_modules/.bin/speclaw` stub that writes to stderr and
  exits with code 1
- When the session-start hook command runs through `sh -c`
- Then it SHALL exit with code 0
- And stdout and stderr SHALL be empty

#### Scenario: Agents without hook support get no session-start entry
- Given the user selected only agents that do not declare a `hooks` capability
- When `init` completes
- Then no `SessionStart` entry SHALL be written for those agents

### Requirement: Action evaluation

The `speclaw_check` tool SHALL evaluate an agent action against every law whose
scope matches the action's target and return a verdict of `allow`, `warn`,
`deny`, or `escalate`, together with an `evaluated` list and an `elapsedMs`
measurement. It SHALL evaluate the `path` backend only; the graph-reading `deps`
and `graph` backends SHALL NOT run on this surface, so no index query executes on
the keystroke latency budget. WHEN the event is `PostToolUse` and the tool is
`Read`, `Grep`, or `Glob`, the check SHALL evaluate only the Compass-first nudge
specified below and SHALL NOT evaluate any law, so laws keep governing mutations
alone; the nudge SHALL NOT change the verdict. WHEN the event is `PostToolUse`
and the result carries a `reason`, the `speclaw_check` result SHALL also carry
`hookSpecificOutput` with `hookEventName` and `additionalContext` set to that
reason, so that an `mcp_tool` hook delivers it to the agent's context, and
SHALL NOT carry a `permissionDecision`; results for every other event
(`PreToolUse`, `Stop`, `InstructionsLoaded`) SHALL NOT carry
`hookSpecificOutput` and SHALL keep their shape. The same logic SHALL be
reachable from the CLI via `speclaw check`: `--hook-payload -` reads a hook
payload from stdin and, for a `PreToolUse` payload, emits the agent's
`hookSpecificOutput.permissionDecision`, exiting with code `2` on `deny` and `0`
otherwise (including every fail-open path); for a `PostToolUse` payload it
emits `hookSpecificOutput.additionalContext` when the result carries a reason
(nothing otherwise), never emits a `permissionDecision`, and exits `0`; for any
other event it emits `hookSpecificOutput.permissionDecision` `allow` and exits
`0`, as before this change; `--dry-run --path <file>` previews
the verdict without blocking; and with no flags it summarizes the declared laws.

#### Scenario: The command-hook fallback signals a block via exit code
- Given a blocking law matching `.env`
- When `speclaw check --hook-payload -` receives a `PreToolUse` payload targeting
  `.env` on stdin
- Then it SHALL print `hookSpecificOutput` with `permissionDecision` `deny`
- And it SHALL exit with code `2`

#### Scenario: The command-hook fallback carries PostToolUse context without a decision
- Given an empty Compass call log
- When `speclaw check --hook-payload -` receives a `PostToolUse` `Read` payload
  targeting `src/server.ts` on stdin
- Then it SHALL print `hookSpecificOutput` with `additionalContext` containing
  the Compass-first nudge
- And the output SHALL NOT contain `permissionDecision`
- And it SHALL exit with code `0`

#### Scenario: The MCP result carries additionalContext on PostToolUse
- Given an empty Compass call log
- When the `speclaw_check` MCP tool receives `PostToolUse` for `Read` of
  `src/server.ts`
- Then its result SHALL carry `hookSpecificOutput.hookEventName` `PostToolUse`
  and `hookSpecificOutput.additionalContext` equal to the nudge text
- And the result SHALL NOT contain `permissionDecision`
- And a `PreToolUse` result SHALL NOT carry `hookSpecificOutput`

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

### Requirement: Compass-first nudge `req~compass-nudge~1`

WHEN `speclaw_check` receives a `PostToolUse` event for `Read`, `Grep`, or
`Glob`, the system SHALL resolve the target from the first non-empty of
`tool_input.file_path` and `tool_input.path`, treating a value that still holds an
unsubstituted `${` placeholder as empty; an empty target means the project root.
IF the target lies outside the project or under `node_modules/`, `.git/`,
`.speclaw/`, or `dist/`, THEN the system SHALL emit no nudge. A `Read` target
SHALL be eligible only when its extension belongs to a Compass-indexed language.
A `Grep` target SHALL be eligible when it is an indexed-language file, a
directory, or the project root (a repo-wide search), unless `tool_input.glob`
names only non-indexed extensions or `tool_input.type` names a non-indexed
language. A `Glob` target SHALL be eligible when it is an indexed-language file,
or a directory or the project root whose `tool_input.pattern` names an
indexed-language extension or no extension (for example `**/*`); a directory
`Glob` with no pattern SHALL be eligible and a project-root `Glob` with no
pattern SHALL NOT. Whether a target is a directory SHALL be decided by one
filesystem `stat` of the target, so that a directory whose name contains a dot
(for example `src/v1.2`) counts as a directory and a directory is never an
eligible `Read` target; WHEN the `stat` fails, the target SHALL be classified by
its extension. WHEN the target is eligible, the call log holds no
Compass evidence call from the last 10 minutes, and no nudge was recorded in the
last 5 minutes, the system SHALL record a nudge entry in the call log and SHALL
return a `nudge` text — also appended to `reason` — that names
`compass_explore` and `compass_find` and suggests a query built from the `Grep`
pattern, the target's file stem, or the `Glob` pattern. The nudge SHALL be evaluated whether or not
the law manifest exists, SHALL read only the bounded call-log tail and the
in-memory extension table, SHALL NOT open or query the index database, SHALL NOT
change the verdict, and SHALL emit no nudge when its own evaluation fails. For
these `PostToolUse` `Read`/`Grep`/`Glob` calls the result SHALL carry an empty
`evaluated` list and a `reason` that is the nudge text or absent.

Needs: impl, utest
Status: approved

#### Scenario: Reading code without recent Compass calls nudges
- Given an empty Compass call log and no law manifest
- When `speclaw_check` is invoked with event `PostToolUse`, tool `Read`, and
  `file_path` `src/server.ts`
- Then the result SHALL carry a `nudge` naming `compass_explore` and
  `compass_find`
- And the verdict SHALL be `allow`

#### Scenario: A recent Compass call suppresses the nudge
- Given a `compass_explore` call recorded 2 minutes ago
- When `speclaw_check` is invoked with event `PostToolUse`, tool `Read`, and
  `file_path` `src/server.ts`
- Then the result SHALL NOT carry a `nudge`

#### Scenario: Nudges are rate limited
- Given an empty call log
- When two eligible `PostToolUse` `Read` checks run one minute apart
- Then only the first result SHALL carry a `nudge`

#### Scenario: Non-code and empty targets do not nudge
- Given an empty call log
- When `speclaw_check` receives `PostToolUse` for `Read` of `README.md`, for
  `Read` with an empty `file_path`, for `Grep` with no `path` and `glob`
  `*.md`, and for `Glob` whose `path` and `pattern` are the literal
  `${tool_input.path}` and `${tool_input.pattern}`
- Then none of the results SHALL carry a `nudge`

#### Scenario: A repo-wide Grep or Glob nudges
- Given an empty call log
- When `speclaw_check` receives `PostToolUse` for `Grep` with no `path` and
  `pattern` `handleHarness`, or for `Glob` with no `path` and `pattern`
  `**/*.ts`
- Then the result SHALL carry a `nudge`
- And the `Grep` nudge SHALL suggest `compass_find` with `handleHarness`

#### Scenario: Reads never evaluate laws
- Given a `feedback` law whose scope matches `src/server.ts`
- When `speclaw_check` receives `PostToolUse` for `Read` of `src/server.ts`
- Then `evaluated` SHALL be empty and no law message SHALL appear in `reason`
- And `PostToolUse` for `Write` of `src/server.ts` SHALL still return that law's
  message

#### Scenario: A dotted directory name is still a directory
- Given an empty call log and an existing directory `src/v1.2`
- When `speclaw_check` receives `PostToolUse` for `Grep` with `path` `src/v1.2`
- Then the result SHALL carry a `nudge`
- And `PostToolUse` for `Read` of `src/v1.2` SHALL NOT carry a `nudge`

#### Scenario: Stop results carry no hookSpecificOutput
- Given a `gate` law whose scope matches `src/a.ts`
- When `speclaw_check` receives `Stop` with a payload targeting `src/a.ts`
- Then the result SHALL carry the law's `reason`
- And the result SHALL NOT carry `hookSpecificOutput`

#### Scenario: Grep over a source directory nudges with the pattern
- Given an empty call log
- When `speclaw_check` receives `PostToolUse` for `Grep` with `path` `src` and
  `pattern` `handleHarness`
- Then the `nudge` SHALL suggest `compass_find` with `handleHarness`

#### Scenario: PreToolUse never nudges
- Given an empty call log
- When `speclaw_check` receives `PreToolUse` for `Read` of `src/server.ts`
- Then the result SHALL NOT carry a `nudge`

#### Scenario: The nudge never touches the index database
- Given a project with `.speclaw/index.db`
- When an eligible `PostToolUse` `Read` check runs
- Then no index database connection SHALL be opened during the check

#### Scenario: The nudge path stays within the hook latency budget
- Given the built CLI and a scratch copy of this repository
- When `speclaw check --hook-payload -` runs at least 20 times with an eligible
  `PostToolUse` `Read` payload
- Then the p95 wall-clock time SHALL be under 50 ms
- And `reports/performance.md` SHALL record the median and p95 for `main` and
  the branch

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

### Requirement: Graph backend `req~graph-honours-scope~1`

speclaw SHALL evaluate a `graph` law over the Compass index for dependency cycles
and transitive reachability, at file granularity. Cycle detection SHALL use an
iterative strongly-connected-component algorithm that does not overflow the stack
on deep import chains, and SHALL report the minimal cycle found inside a component
rather than the whole component, while reporting the enclosing component's size as
additional detail. An intra-file self-dependency (an edge whose source and
destination file are the same) SHALL be excluded from the graph and SHALL NOT be
reported as a cycle violation — at file granularity it is not a cycle. The
adjacency SHALL include only files that match the law's `scope` globs (an empty
scope means the whole indexed graph) and the optional `paths` filter. Cycle
detection SHALL honour `rule.edgeKinds` when present.

Needs: impl, utest
Status: proposed

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

#### Scenario: Graph law scope excludes out-of-scope files
- Given a graph law scoped to `src/modules/**`
- And a cycle that only involves `src/shared/a.ts` and `src/shared/b.ts`
- When `law_verify` runs
- Then that cycle SHALL NOT be a finding for that law

#### Scenario: Out-of-scope test files are not module cycles
- Given a production file under a cycle law's scope and a spec file excluded by
  that scope
- And the spec imports the production file
- When `law_verify` runs
- Then no cycle finding SHALL be produced for that spec↔production pair

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

### Requirement: Lock refresh preserves drifted strict digests `req~lock-preserves-drift~1`

WHEN `speclaw init`, `speclaw update`, `speclaw laws compile`, or `speclaw laws
lock` refreshes an existing `speclaw.lock`, the system SHALL determine, before
writing any rule artifact, the drifted paths: the `strict` lock entries whose
on-disk digest matches neither the locked digest nor an `accepted[]` digest for
that path. After the writes, the system SHALL keep the locked entry of every
drifted path, SHALL refresh the digest of every other `strict` path, SHALL add
`strict` paths that the previous lock did not hold, SHALL refresh `advisory`
paths from disk, and SHALL drop every `accepted[]` entry whose path is no longer
locked or whose digest differs from that path's locked digest. IF a drifted
path's digest after the writes still differs from its kept digest, THEN the
system SHALL warn naming the path and the command `speclaw laws accept <path>`.
WHEN `speclaw laws lock --force` runs on an interactive terminal and paths have
drifted, the system SHALL list each drifted path with its locked and on-disk
digests and SHALL ask for a confirmation that defaults to No; once confirmed, it
SHALL re-baseline the drifted paths to their on-disk digests and SHALL record an
`accepted[]` entry for each re-baselined path (with the optional `--note`). IF
the confirmation is declined or cancelled, THEN the command SHALL exit non-zero
without writing the lockfile. IF, after the confirmation, the set of drifted
strict paths or any listed path's locked or on-disk digest differs from what was
listed, THEN the command SHALL exit non-zero without writing the lockfile and
SHALL say that the files changed while the confirmation was open. IF `--force`
is passed without an interactive terminal, THEN the command SHALL exit non-zero
without writing the lockfile. Only WHEN no lockfile exists SHALL the refresh
create the baseline from disk. IF `speclaw.lock` exists but cannot be read (it
does not parse, its `lockfileVersion` is missing or unsupported, or it parses
but has the wrong structure: `files` or `symlinks` present but not an object, a
`files` entry without a string `digest` or a known `ownership`, a `symlinks`
entry without a string `target`, or `accepted` present but not an array of
records with a string `path` and `digest`), THEN every refresh SHALL leave it
byte-identical and SHALL report the error, and `speclaw init`, `speclaw update`,
`speclaw laws compile`, and `speclaw laws lock` (with or without `--force`)
SHALL exit non-zero.

Needs: impl, utest
Status: approved

#### Scenario: A modified CLAUDE.md survives an update refresh
- Given a scaffolded project with a lockfile digest for `CLAUDE.md`
- And `CLAUDE.md` modified outside the speclaw pipeline
- When the init/update scaffold refresh runs, including law compilation
- Then the `CLAUDE.md` lock digest SHALL be unchanged
- And `verifyIntegrity` SHALL report `ok` false with `CLAUDE.md` `modified`
- And a warning SHALL name `speclaw laws accept CLAUDE.md`

#### Scenario: A clean strict file is refreshed after compilation rewrites it
- Given a lockfile whose `AGENTS.md` digest matches the file on disk
- When law compilation rewrites the speclaw block of `AGENTS.md` and the lock is
  refreshed
- Then the `AGENTS.md` lock digest SHALL match the new file
- And `verifyIntegrity` SHALL report no finding for `AGENTS.md`

#### Scenario: A new strict path is added
- Given a lockfile that holds no entry for a compiled rule file just written
- When the lock is refreshed
- Then the lock SHALL hold that path with its on-disk digest

#### Scenario: An advisory edit is refreshed freely
- Given a lockfile digest for `docs/standards/base-standards.md`
- And that file edited by the user
- When the lock is refreshed
- Then the lock digest SHALL match the edited file
- And no `laws accept` warning SHALL name it

#### Scenario: Stale accepted entries are pruned
- Given an `accepted[]` entry for a path no longer locked, and one whose digest
  differs from the path's refreshed digest
- When the lock is refreshed
- Then neither entry SHALL remain in `accepted[]`

#### Scenario: Laws lock preserves drift and warns
- Given a lockfile and a strict file modified outside the pipeline
- When `speclaw laws lock` runs without `--force`
- Then that file's lock digest SHALL be unchanged
- And the output SHALL name `speclaw laws accept <path>`

#### Scenario: Force without a terminal leaves the lock unchanged
- Given a lockfile and a drifted strict file
- When `speclaw laws lock --force` runs without an interactive terminal
- Then the command SHALL exit non-zero
- And `speclaw.lock` SHALL be byte-identical to before

#### Scenario: Force on a terminal re-baselines and records acceptance
- Given a lockfile and a drifted strict file
- When `speclaw laws lock --force` runs on an interactive terminal
- And the user confirms after the path and its locked and on-disk digests are
  listed
- Then that file's lock digest SHALL match the file on disk
- And `accepted[]` SHALL hold an entry for that path with the new digest

#### Scenario: Force declined leaves the lock unchanged
- Given a lockfile and a drifted strict file
- When `speclaw laws lock --force` runs on an interactive terminal
- And the user declines or cancels the confirmation
- Then the command SHALL exit non-zero
- And `speclaw.lock` SHALL be byte-identical to before

#### Scenario: Force writes nothing when files change during the confirmation
- Given a lockfile and a drifted strict file listed by `speclaw laws lock
  --force` on an interactive terminal
- And, while the confirmation is open, that file changes again or another strict
  file drifts
- When the user confirms
- Then the command SHALL exit non-zero and say the files changed while the
  confirmation was open
- And `speclaw.lock` SHALL be byte-identical to before

#### Scenario: An unreadable lockfile is never rebuilt
- Given a `speclaw.lock` holding merge-conflict markers, one with
  `lockfileVersion` 99, or one that parses but has the wrong structure (`files`
  a string or an array, a `files` entry without a string digest, `accepted` not
  an array, or `symlinks` a string)
- And a strict file modified outside the pipeline
- When the init/update scaffold refresh, `speclaw laws compile`, or `speclaw
  laws lock` runs
- Then `speclaw.lock` SHALL be byte-identical to before
- And the error SHALL be reported, with a non-zero exit for the CLI commands

### Requirement: Integrity verification in verify pipeline `req~integrity-verify~1`

WHEN `speclaw verify` runs and a `speclaw.lock` is present, the system SHALL
compare lock entries to files on disk via `verifyIntegrity` (distinct from
deps/graph `verifyLaws`). WHILE a path is classified `strict` (including
`AGENTS.md`, `CLAUDE.md`, and compiled dialect rules), a digest mismatch,
missing file, or redirected managed symlink SHALL fail verification. WHILE a
path is classified `advisory` (including `docs/standards/**`), a mismatch
SHALL warn without forcing a failing exit by itself. WHEN no lockfile exists,
verification SHALL exit successfully regarding integrity and SHALL instruct how
to create a baseline. WHEN the lock is refreshed, the system SHALL NOT pin a
symlink that is a regenerable IDE mirror (the `.claude/rules/speclaw` link to
the gitignored `ai-specs/rules`), so the lock is identical whether or not the
link exists locally. IF a lock entry for a regenerable IDE mirror symlink is missing
or retargeted on disk, THEN verification SHALL report a warning and SHALL NOT
fail for that entry.

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

#### Scenario: Regenerable mirror symlink is not pinned and its absence does not fail verify
- Given `.claude/rules/speclaw` is a symlink to `../../ai-specs/rules`
- When the lock is refreshed
- Then `speclaw.lock` SHALL record `"symlinks": {}`
- And given a lock written by an older version that pins `.claude/rules/speclaw`
- And a clean clone where the link is absent
- When `speclaw verify` runs
- Then integrity SHALL NOT fail the run for that entry
- And a warning SHALL name `.claude/rules/speclaw`

#### Scenario: Missing non-mirror managed symlink fails verify
- Given a lockfile entry for a managed symlink that is not a regenerable mirror
- And that link is missing or points at a different target
- When `speclaw verify` runs
- Then the exit code SHALL be non-zero

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

WHEN a user updates a recorded digest of a drifted file, speclaw SHALL require
interactive TTY confirmation via `speclaw laws accept` or via `speclaw laws
lock --force`. speclaw SHALL NOT expose digest acceptance over MCP, and an
automatic lock refresh (init, update, laws compile, laws lock without
`--force`) SHALL NOT move a drifted strict digest and SHALL NOT rebuild an
existing lockfile that cannot be read. WHEN accept or `laws lock
--force` runs without a TTY, the command SHALL fail without writing the
lockfile. IF `speclaw laws accept` finds a lockfile that cannot be read, THEN it
SHALL print the error without a stack trace, SHALL exit non-zero, and SHALL NOT
write the lockfile. IF `speclaw laws accept` fails for any other reason (for
example a scan-only path), THEN it SHALL print that error alone, without the
lockfile repair advice, SHALL exit non-zero, and SHALL NOT write the lockfile.

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

#### Scenario: Lock force without TTY fails
- Given a non-interactive environment and a drifted strict file
- When `speclaw laws lock --force` is invoked
- Then the command SHALL exit non-zero
- And the lockfile SHALL be unchanged

#### Scenario: Accept on an unreadable lockfile fails cleanly
- Given an interactive terminal and a `speclaw.lock` holding merge-conflict
  markers
- When `speclaw laws accept CLAUDE.md` is invoked
- Then the command SHALL exit non-zero with an error naming `speclaw.lock` and
  no stack trace
- And the lockfile SHALL be unchanged

#### Scenario: Accept on a scan-only path reports that error alone
- Given an interactive terminal, a valid `speclaw.lock`, and a `.cursorrules`
  file
- When `speclaw laws accept .cursorrules` is invoked and confirmed
- Then the command SHALL exit non-zero with an error saying the path is
  scan-only
- And the error SHALL NOT advise deleting `speclaw.lock` or running
  `speclaw laws lock`
- And the lockfile SHALL be unchanged
