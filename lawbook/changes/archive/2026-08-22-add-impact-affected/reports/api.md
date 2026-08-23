# API checks — add-impact-affected (2026-08-22)

Date · Branch `feat/impact-affected` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ |
| Build | `npm run build` | ✅ |
| Contract register suite | `npm test` (registers.test.ts) | ✅ tools include `compass_affected_tests`; impact accepts `node`/`symbol` |
| Manual MCP-shaped CLI | `node dist/cli/index.js impact openDb` / `affected-tests --file … --json` | ✅ grouped JSON; global `blastRadius: "repo"`; command string |

## Contract surface

| Tool / command | Auth | Shape | Status / notes |
| --- | --- | --- | --- |
| `compass_impact` | local projectPath | Grouped `ImpactResult` by default; `format: flat`; optional `files`/`nodeId`/`edgeKinds`/`target` | **Breaking** vs prior flat array — documented in CHANGELOG 0.3.10 |
| `compass_affected_tests` | local projectPath | `{ mode, reason, tests, skipped, command, warnings }` | New; omitted in minimal exposure |
| `speclaw impact` | CLI | Human table or `--json`; `--flat`; `--file` | No branded header |
| `speclaw affected-tests` | CLI | `--file` / `--from-diff` / `--json` | No branded header |

## Tests added / updated

- Contract: tool list + legacy `node` input still wraps as MCP text.
- Manual: dogfood against this repo after `speclaw index` (schema 7).

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| help documents impact / affected-tests | HELP string in `cli/index.ts` |
| Impact / affected-tests stdout has no branded header | query family excluded from `HEADER_COMMANDS` |
| Default impact summarised | dogfood grouped output for `openDb` |
| Diff / JSON modes | `--json` dogfood + integration from-diff |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Ready to sync and archive.
