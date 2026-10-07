# Proposal — coordinator-status-updates

## Why

During a Cortex run, the human often waits several minutes while a role agent
works, and gets no word on progress. The coordinator knows the stage, the role,
and the harness state, but nothing makes it report them. The human cannot tell
whether the run is moving, stuck in rework, or waiting on them.

## What changes

1. **Status summary on `cortex status` (API surface).** The `cortex` MCP tool,
   action `status`, and `speclaw cortex status` return a `summary` next to
   `state`. It holds the stage, the active role, the elapsed time in the
   stage, the tasks done/total (from the `tasks.md` checkboxes, or `record.md`
   at level 0), the rework iteration/max, the pending verdicts, the
   open-question count, the configured interval, and a one-line English
   rendering (`line`). The CLI also prints `line` to stderr unless `--json`
   is passed. stdout stays pure JSON. The MCP input schema does not change.
2. **Configurable interval.** `cortex.statusIntervalMinutes` in
   `lawbook/config.yaml`. The default is 5. `0` disables status updates. An
   invalid value falls back to 5. The value is reported in the summary, so the
   skill never parses YAML.
3. **The `cortex` skill posts status updates.** While a run is active and the
   interval is > 0, the coordinator posts a compact update in the session's
   language. Stage, role, and tool names, file paths, and change names stay in
   English. Updates are posted:
   - after every Cortex op and before every blocking role dispatch, on every
     host;
   - on a recurring session timer every N minutes, where the host has one
     (Claude Code `CronCreate`). Background dispatch is preferred, so the timer
     can fire.

   Timer pings are skipped in the `questions` stage. The timer is created only
   inside a Cortex run and deleted at `done`, when the run stops, or when the
   human asks to stop the updates.

## Capability

The change reuses the existing **`lawbook-workflow`** capability, in its
"Multi-agent harness (Cortex)" section, by its exact name. The delta is a
full-file copy of the current canonical spec plus three new requirements:

- `req~cortex-status-summary~1`
- `req~cortex-status-interval~1`
- `req~cortex-status-updates~1`

No existing requirement is removed or reworded.

The former sibling changes `index-at-session-start` and
`fix-compass-source-offsets` shipped and were archived in 2.0.7. Neither
touched `lawbook-workflow`; the canonical spec is unchanged by 2.0.7 apart from
this change's intended additions, so there is no sync-order constraint.

## Out of scope

- An all-changes / no-`change` mode for `status`. The MCP schema keeps
  `change` required (design D5).
- Adding `summary` to `brief`.
- Host scheduler support in `AgentDef`. The timer is skill guidance, not an
  engine feature.
- Tracking dispatched agents. One stage maps to one role, and the stage start
  stands in for the dispatch time.

## Release

Ships in **2.0.8** on its own branch, `feat/coordinator-status-updates`. The
coordinator owns the version bump and CHANGELOG entry.
