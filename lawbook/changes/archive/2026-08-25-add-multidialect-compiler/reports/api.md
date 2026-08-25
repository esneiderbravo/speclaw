# API checks — add-multidialect-compiler (2026-08-25)

Date · Branch `feat/multidialect-compiler` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ |
| Build | `npm run build` | ✅ |
| Tests | `npm test` | ✅ 400 pass / 0 fail |

## Surface

| Surface | Contract |
| --- | --- |
| `speclaw laws compile` | Optional `--agent`, `--json` compile report |
| `speclaw laws import --from rulesync` | Draft laws; error without `--from` |
| Help | Lists compile + import |
| MCP | **No new tools** (tool-surface) |

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Help lists compile and import | manual `speclaw help` |
| Compile JSON | manual `--json` in tmp dir |
| Import requires from | unit throws / CLI usage |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

✅ CLI surface matches delta; no MCP expansion.
