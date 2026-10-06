# Proposal — enforce-compass-first

## Why

Rule 1 ("Compass first, always") is prose only. In a real Cortex run
(ftd-admin-finanzas FAR-2199 transcripts) the explorer made **0**
`compass_explore` calls and **69** Read/Grep/Glob calls. About 20 of the 34
minutes went to two separate human question rounds. The planner re-read files
the explorer had already covered. There was also no CLI scaffold for a
non-bug change. The engine never checks the rule, the hooks never point the
agent at Compass, and `compass_index` gives no next step, so agents index the
repo and then fall back to grep.

## What changes

1. **Compass evidence gate (Cortex).** Compass tools write each call to a
   bounded per-project call log (`.speclaw/compass-calls.jsonl`). A Cortex
   `advance` out of `exploring` or `implementing` counts the evidence calls
   made since that stage started. Evidence calls are `compass_explore`,
   `compass_find`, `compass_diff_context`, the aliases `compass_impact`,
   `compass_trace`, `compass_search`, and `compass_recall`, and their CLI twins.
   `compass_index` does not count. The new `compassGate: off|warn|strict` key
   in `lawbook/config.yaml` sets the behavior. The default is `warn`: the
   advance still succeeds but the result carries a warning. `strict` rejects
   the advance and leaves state unchanged.
2. **Compass-first hook nudge (Foundation).** Every hook-capable agent gets a
   `PostToolUse` hook with matcher `Read|Grep|Glob`, installed whether or not
   the project has laws. It calls `speclaw_check`. When the target is code in a
   Compass-indexed language and the call log shows no recent Compass evidence,
   the hook adds a short "try `compass_explore`/`compass_find`" message to the
   agent's context. It never allows or denies anything. It never runs on
   `PreToolUse`. It never queries the index database.
3. **Actionable `compass_index` output.** Index stats gain repository
   `totals` (files, nodes, edges) and a `nextStep` hint that names
   `compass_find` / `compass_explore`. The MCP tool and `speclaw index` both
   show them.
4. **Feature draft scaffold.** `speclaw lawbook draft <name> [--level N]
   [--json]` scaffolds a feature change (`--bug` keeps today's behavior). The
   MCP equivalent is a new `lawbook_change` action `draft` with an optional
   `bug` flag, so the tool count stays at nine. One generic `scaffoldChange`
   replaces the logic that `quick` and `bugfix` each copy today.
5. **Workflow texts.**
   - The explore step runs `compass_find` first. It runs `compass_index` only
     when find returns nothing, and reads code with Read/Grep only for a named
     reason.
   - The explorer brief reports "Compass calls made: N".
   - Cortex dispatch gets an explorer template (symbols and questions, never
     file paths).
   - Explorer open questions, planner questions, and the ceremony-level
     proposal and confirmation go to the human in **one** `pauseForQuestions`
     round.
   - Role agents list canonical tool names only.
6. **Docs and release.** Update `docs/compass.md`, `docs/cortex.md`, and the
   operator notes in `CLAUDE.md` / `AGENTS.md`. Patch bump to `2.0.4`.

## Capabilities touched

- `lawbook-workflow` (updated): Compass evidence gate and call log, explore
  index policy, explorer brief Compass-call line, single question round,
  canonical tool names in role agents, feature draft scaffold.
- `law-enforcement` (updated): hook generation (Compass nudge entry and the
  `path`/`pattern` input template), action evaluation (nudge branch, CLI
  `PostToolUse` output with no permission decision). The rule that the check
  makes no index database query stays as it is.
- `cli` (updated): index totals and next-step hint, feature draft entry, MCP
  `lawbook_change` `draft` action.

No new capability is introduced. `code-graph` is not changed: no Compass tool
is added, removed, or renamed. Recording calls is a side effect that the
lawbook-workflow gate requirement specifies (see design.md).

## Out of scope

- Blocking Read/Grep/Glob, or emitting `allow` on `PreToolUse`.
- Tracking calls per session. The call log is per project, so concurrent
  sessions can satisfy each other's gate. This limitation is accepted and
  documented.
- Changing what the CLI `check --hook-payload` fallback emits for
  `PreToolUse` non-deny verdicts.
