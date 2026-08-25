# API checks — add-spec-owners (2026-08-25)

Date · Branch · Environment: 2026-08-25 · `feat/spec-owners` · `/Users/esneiderbravo/Projects/speclaw`

CLI surface treated as the public API for this change (no HTTP, no new MCP tool).

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Help contract | `node dist/cli/index.js help` | ✅ lists `owners` |
| Write | `node dist/cli/index.js owners --write` | ✅ wrote 4-key block → `.github/CODEOWNERS` |
| Check | `node dist/cli/index.js owners --check` | ✅ owners block matches team.owners |
| Doctor | `node dist/cli/index.js doctor --json --offline` | ✅ `cfg.owners.syntax` ok · `cfg.owners.block` ok · `cfg.owners.protection` warn (decorative) |
| MCP budget | `test/integration/owners.test.ts` + tool-catalog | ✅ still 8 canonical tools; no `owners` / `team_owners` tool |

### Contract

| Surface | Auth | Success | Failure | Isolation |
| --- | --- | --- | --- | --- |
| `speclaw owners --write` | local FS only | exit 0; managed block at end of `.github/CODEOWNERS` | exit 1 on invalid tokens | temp repos in tests; dogfood write only to this checkout's CODEOWNERS |
| `speclaw owners` / `--check` | local FS only | exit 0 when in sync | exit 1 on drift / content-after / bad tokens | same |
| MCP | n/a | no new tool | — | catalog assertion |

## Tests added / updated

Integration CLI spawn tests under `test/integration/owners.test.ts` (temp dirs via `tmpRepo`).

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Help lists owners | integration + live help |
| Write updates CODEOWNERS without a new MCP tool | integration + catalog assert |
| Check mode reports drift without writing | integration (append after end → non-zero; file not rewritten by check) |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

CLI owners API matches the `cli` delta; MCP surface unchanged.
