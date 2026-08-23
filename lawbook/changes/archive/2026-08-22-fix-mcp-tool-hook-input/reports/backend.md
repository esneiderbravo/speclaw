# backend — fix-mcp-tool-hook-input

- **Discipline:** backend
- **Change:** fix-mcp-tool-hook-input
- **Date:** 2026-08-22
- **Branch:** fix/mcp-tool-hook-input
- **Environment:** local workspace `/Users/esneiderbravo/Projects/speclaw`

## Gates and results

| Check | Command | Result |
|-------|---------|--------|
| Format + lint | `npm run check` | pass |
| Build | `npm run build` | pass (`0.3.7`) |
| Unit/integration (hooks) | `npm test` (hooks cases) | `compileHooks…`, `installHooks upgrades legacy…`, `scaffold seeds…` pass |

## Tests added or updated

- `test/unit/hooks.test.ts` — asserts `input` templates; upgrades legacy hooks without `input` while preserving foreign command hooks.
- `test/integration/hooks.test.ts` — scaffolded Claude settings include `input.projectPath` / `event` / `payload.tool_input.file_path`.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| Hooks generated for a hook-capable agent (with `input`) | unit + integration hooks tests |
| Update rewrites hooks that lacked input | unit `installHooks upgrades legacy…` + manual scaffold refresh |
| Pre-existing user hooks are preserved | unit upgrade test keeps `echo keep-me` |

## Pre-existing / unrelated failures

Local sandbox blocks git in tmp repos (`isGitRepo` / history tests) — same as prior CI-green runs; not caused by this change. CI has full git.

## Manual steps not automated

- Confirmed scaffold refresh on a temp project: legacy hooks without `input` become the templated shape (`HAS_INPUT true`).

## Verdict

Backend hook compiler ready for release via `speclaw update`.
