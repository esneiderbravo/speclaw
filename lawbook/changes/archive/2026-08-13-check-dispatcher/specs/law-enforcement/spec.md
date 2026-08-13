# Law enforcement

Runtime enforcement of a project's declared laws through agent hooks. speclaw
compiles the laws into hook configuration for hook-capable agents, evaluates a
pending or completed agent action against the laws whose scope matches, and
returns a verdict that can block the action. This capability governs the `Law`
model and `.speclaw/laws-manifest.json`, the `speclaw_check` MCP tool and its
`speclaw check` CLI twin, the hook compiler and its idempotent merge into an
agent's settings, the `AgentDef` hook capability, the context-coverage audit,
and glob validation. This change implements a single verification backend —
`path` (pure glob matching); other backends are defined by `executable-laws`.

### Requirement: Law manifest

speclaw SHALL maintain a machine-readable law manifest at
`.speclaw/laws-manifest.json`. During `init` it SHALL seed the manifest from the
package's shipped starter laws when the project has none; during `init` and
`update` it SHALL (re)compile the agent hooks from the manifest that exists.
A manifest already present SHALL NOT be overwritten, so a curated manifest
survives an `update`. Each law SHALL carry `id`, `title`, `prose`, `severity`,
`scope` (globs), `verification`, `enforcement`, and `source` (file, optional
line). speclaw SHALL implement the `path` verification backend only; a law whose
`verification` names any other backend SHALL be written to the manifest but
SHALL NOT be evaluated at runtime.

#### Scenario: The manifest is seeded on init
- Given a project being initialized that has no law manifest
- When `init` completes
- Then `.speclaw/laws-manifest.json` exists and contains the shipped starter
  laws, each with its `id`, `scope`, `verification`, `enforcement`, and `source`

#### Scenario: A curated manifest is preserved on update
- Given a project whose `.speclaw/laws-manifest.json` already exists
- When `update` runs
- Then speclaw SHALL recompile the hooks from that manifest
- And SHALL NOT overwrite the manifest's contents

#### Scenario: A law with an unimplemented backend is declared but inert
- Given a law whose `verification` is `deps` (a backend not implemented here)
- When `speclaw_check` evaluates a matching action
- Then that law SHALL NOT contribute to the verdict
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
measurement. The same logic SHALL be reachable from the CLI via `speclaw check`:
`--hook-payload -` reads a hook payload from stdin and emits the agent's
`hookSpecificOutput.permissionDecision`, exiting with code `2` on `deny` and `0`
otherwise (including every fail-open path); `--dry-run --path <file>` previews
the verdict without blocking; and with no flags it summarizes the declared laws.

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

#### Scenario: Evaluator failure fails open
- Given the law manifest is missing or unparseable
- When `speclaw_check` is invoked with event `PreToolUse`
- Then the verdict SHALL be `allow`
- And the result SHALL carry a diagnostic message describing the failure

#### Scenario: PreToolUse latency stays within budget
- Given a project with 50 declared laws
- When `speclaw_check` is invoked 100 times with event `PreToolUse`
- Then the p99 of `elapsedMs` SHALL be under 15

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

speclaw SHALL reject an invalid law scope at generation time rather than at
runtime, so a malformed glob never silently matches zero files during
enforcement.

#### Scenario: Malformed glob is caught at generation time
- Given a law whose scope contains an unclosed bracket
- When `init` or `doctor` runs
- Then the command SHALL report the law id and the malformed pattern
- And `init` SHALL NOT write a hook entry for that law
