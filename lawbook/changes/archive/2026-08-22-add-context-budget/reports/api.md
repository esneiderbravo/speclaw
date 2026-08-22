# API checks — add-context-budget (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/context-budget` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Contract registers | `npm test` (contract suite) | ✅ 21 tools full; 7 tools minimal |
| CLI budget | `node dist/cli/index.js budget --json` | ✅ surfaces A–D + total |
| CLI doctor | `node dist/cli/index.js doctor` | ✅ exposure profile + context budget lines |

## Tests added / updated

- Contract tests still capture all register modules; descriptions rewritten.
- `collectRegisteredTools` / `measureInstallBudget` exercise the same registration path as MCP.

## Spec-scenario coverage (API-relevant)

| Scenario | Verified by |
| :-- | :-- |
| `help` lists budget | HELP string in `src/cli/index.ts` + manual |
| `budget` prints surface table | Manual CLI |
| `budget --json` emits no header | `maybeHeader` suppresses when `flags.json` |
| Default exposure full set | `collectRegisteredTools(false)` → 21 |
| Minimal omits omit-set | `collectRegisteredTools(true)` → 7 kept |
| Tool descriptions ≤25 words | contract + unit |
| No `defer_loading` | `defineTool` never sets it (code review + design) |

### CLI contract (`speclaw budget`)

- Human: per-surface table + profile line + Spec Kit comparison.
- `--json`: `{ schemaVersion, profile, tools, skillsAndCommands, alwaysOnInstructions, pathScoped, total, toolCount, declared, details }`.
- Exit 0 on success.

### MCP registration contract

- All tools via `defineTool` (word + token caps).
- Minimal omit-set: `compass_index|watch|impact|trace|visualize`, `lawbook_init|archive|list`, `init_project|scaffold|configure_agent|doctor`, `add_pack|list_packs`.
- Kept in minimal: `compass_explore|search|recall`, `lawbook_validate|sync`, `law_verify`, `speclaw_check`.

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Public CLI and MCP registration contracts match the delta; no `defer_loading` fiction.
