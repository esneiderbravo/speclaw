# Backend checks — update-no-global (2026-10-01)

Date: 2026-10-01 · Branch: `fix/update-no-global` · Environment: local,
cwd `/Users/esneiderbravo/Projects/speclaw`, Node v24.17.0, package `2.0.0`.

CLI/backend change only (`src/cli/commands/update.ts`, `update-check.ts`,
`init.ts`, `index.ts`, README). No frontend, database, or HTTP API surface —
`frontend.md` / `api.md` / `database.md` omitted.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ Prettier: "All matched files use Prettier code style!"; ESLint: clean (exit 0) |
| Type-check + compile | `npm run build` | ✅ `tsc` clean; `copy-assets: copied assets for 3 module(s)` |
| Unit (update) | `npx tsc -p tsconfig.test.json && node --test dist-test/test/unit/update.test.js` | ✅ `tests 7 · pass 7 · fail 0`; duration ~90ms |
| Related name-pattern | `node --test --test-name-pattern='update\|upgrade' 'dist-test/test/**/*.test.js'` | ✅ `tests 97 · pass 97 · fail 0` (includes the 7 update cases) |
| Smoke CLI | `node dist/cli/index.js update --check` | ✅ exit 0; printed "Already on the latest version (2.0.0)."; no `npm install -g` / spawn |

Source/dist scan: `spawnSync` / `child_process` / `["install","-g"]` absent from
`src/cli/commands/update.ts` and `dist/cli/commands/update.js` (only mention is
comments saying the command never runs global install).

## Tests added / updated

In `test/unit/update.test.ts` (new):

- **`update.ts never spawns npm install -g`** — reads source; asserts no
  `spawnSync`, no `["install","-g"]`, no `child_process`.
- **`binaryUpgradeHint documents separate binary upgrade paths`** — hint names
  `npm i -g …@latest`, `npx …@latest update`, and "only migrates the project".
- **`upgradeNotice no longer claims speclaw update upgrades the package`** —
  notice must not say "upgrades and applies"; must point at `npx … update` /
  migrate wording.
- **`runUpdate does not call spawnSync… when an update is available`** — hooked
  `checkForUpdates` returns available; `applyProjectMigrations` called once;
  no global install path exists to call.
- **`runUpdate --check reports only and skips migrate`** — migrate hook not
  invoked when newer version exists.
- **`runUpdate --migrate-only is an alias of default (still migrates)`** —
  migrate still runs under `--migrate-only`.
- **`runUpdate --check when already latest does not migrate`** — check path
  never migrates.

Isolation: hooks / fixtures only — no real npm global install, no live project
mutation in unit tests. Smoke used this repo’s built CLI with `--check` only
(version advisory; no migrate, no package install).

## Spec-scenario coverage

Level 0 — no delta specs. Mapped from `record.md` “What changes”:

| Scenario (from record) | Verified by |
|------------------------|-------------|
| `speclaw update` never runs `npm install -g` | Unit source scan + hooked `runUpdate` with update available; dist has no spawn |
| Newer version → advisory + binary-upgrade hint, then still migrates | Unit: update-available case migrates once; hint/notice string tests |
| `--check` is version-only | Unit: `--check` skips migrate; smoke: `update --check` exit 0, version message only |
| `--migrate-only` is silent alias of default | Unit: `--migrate-only` still calls migrate |
| Docs/help reflect advisory (not auto-upgrade) | Unit: `upgradeNotice` / `binaryUpgradeHint` assertions |

## Pre-existing / unrelated failures

None observed for the gates above.

## Pending manual steps

None. Live “newer version available” advisory on the built binary was not
exercised end-to-end because npm latest matched installed `2.0.0`; that path is
covered by the hooked unit tests.

## Verdict

PASS
