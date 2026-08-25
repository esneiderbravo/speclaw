# API checks — add-ears-property (2026-08-25)

Date · Branch `feat/ears-property` · Environment: local Node v24.17.0 · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Validate CLI | `speclaw lawbook validate add-ears-property` | ✅ valid; EARS diagnostics on warnings stream |
| Coverage CLI | `speclaw coverage --change add-ears-property` | ✅ TAP `ok - 4 total` |
| MCP surface | no new tool | ✅ Still `lawbook_change` actions validate/coverage (aliases only) |

## Contract exercised

| Surface | Change |
| --- | --- |
| `lawbook_change` / `speclaw lawbook validate` | Emits EARS codes (`ears/unstructured`, `ears/no-modal`, …) as issues (strict) or warnings (lenient / soft codes) |
| `lawbook_change` coverage / `speclaw coverage` | `Needs: ptest` / `Verification: property`; `ptest` in `coveredTypes` / defects |
| MCP catalog | **No** `lawbook_requirements` tool added |

## Spec-scenario coverage (cli)

| Scenario | Verified by |
| --- | --- |
| Validate prints EARS diagnostics without a new MCP tool | CLI validate run (this session) |
| Coverage reports missing ptest | unit + coverage CLI when needs unmet |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

API/CLI surface extended in place; tool-surface consolidation preserved.
