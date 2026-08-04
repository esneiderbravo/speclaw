# Backend checks — add-test-suite-and-ci-gates (2026-08-04)

Date: 2026-08-04 · Branch: `feat/add-test-suite-and-ci-gates` · Environment:
Node v24.17.0, macOS (darwin 25.5.0), cwd `/Users/esneiderbravo/Projects/speclaw`.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ "All matched files use Prettier code style!"; ESLint clean (0 problems) |
| Type-check + compile | `npm run build` | ✅ `tsc` strict clean; `copy-assets: copied assets for 3 module(s)` |
| Type-check tests | `tsc -p tsconfig.test.json` (via `pretest`) | ✅ source + `test/` compile clean into `dist-test/` |
| Tests + coverage | `npm test` | ✅ **112 tests, 112 pass, 0 fail**; coverage **97.80% lines · 91.80% branches · 98.04% functions** (floor 80%) — exit 0 |
| Coverage floor is real | `node --test … --test-coverage-lines=99 …` | ✅ exit 1: `Error: 97.80% line coverage does not meet threshold of 99%.` — proves the gate fails below the floor |

Per-file coverage (in-process core; `dist/**` e2e spawns and `dist-test/test/**`
excluded): every `shared/*` at 100%; `lawbook/engine.js` 99.32; `compass`
db 98.40 / query 96.98 / indexer 93.26 / visualize 100 / extract 100 /
languages 100 / parser 100 / embedder 100 / watcher 80.00; `foundation`
scaffold 100 / doctor 94.23 / ownership 100; every `register.js` 100; all four
`register.js` transports 100% lines.

## Tests added / updated

New `test/` tree (unit · integration · contract; e2e in the separate report):

- **unit** — `render`, `paths`, `mcp`, `version`, `args`, `embedder`,
  `ownership`, `install` (copy/overwrite/backup/baseline branches + gitignore),
  `manifest` (union/merge/malformed), `agents` (symlinks, MCP merge, idempotency,
  unknown-agent throw), `packs`, and `engine` (init/validate/sync/archive +
  every `specArchivePreconditions` blocker). Each asserts a happy path plus at
  least one edge/error case.
- **integration** — `compass` (index → search/explore/recall/impact/trace →
  visualize, incremental + prune, no-index errors), `db` (schema stamp, reopen,
  stale-schema rebuild), `scaffold` (foundation + workflow + gitignore + manifest
  + agent wiring, additive re-run, refreshManaged, error paths), `doctor`
  (unhealthy empty, healthy after scaffold, broken symlink), `watcher`
  (start/stop/status idempotency + a debounced reindex, made deterministic with
  an FSEvents warm-up).
- **contract** — `registers` drives all four `register.ts` through a stub MCP
  server: asserts the declared tool names, Zod rejection of bad input, and
  `text()`-wrapped results by invoking every handler.

Toolchain: `tsconfig.test.json`, `scripts/prep-test-assets.mjs` (stages
`package.json` + module `assets/` into `dist-test/`), `package.json` `pretest`/
`test` scripts, `.gitignore` `dist-test/`.

TDD evidence: the coverage floor was verified to fail (`--test-coverage-lines=99`
→ exit 1) and pass at 80; a mid-build discovery that Node's threshold flags are
0–100 percentages (not 0–1 ratios) was caught and corrected to `=80`.

## Spec-scenario coverage

| Scenario (specs/quality-gates/spec.md) | Verified by |
|----------------------------------------|-------------|
| The suite runs green from a clean checkout | `npm test` → 112/112 pass after `npm run build` |
| Every module is exercised | unit+integration+contract import every `src` module (foundation, compass, lawbook, tools, shared, cli/lib/args); coverage report shows each loaded; e2e drives the CLI (see e2e report) |
| Tests do not touch real data | `tmpRepo()` builds every fs/sqlite world under `os.tmpdir()` with `t.after` cleanup; no repo `.speclaw/`, no network |
| No new dependency is introduced | `package.json` diff adds only scripts; runner is `node:test` + `node:assert/strict` + native coverage |
| Coverage below the floor fails the command | `--test-coverage-lines=99` → exit 1 with "does not meet threshold" |
| New uncovered code is rejected | same mechanism: floor is enforced by `npm test`'s non-zero exit below 80% |
| CI runs the test suite on a pull request | `.github/workflows/ci.yml` `test` job (see e2e report for full CI/protection evidence) |
| A failing test blocks the CI check | `npm test` exit code drives the `test` check |
| Protection configuration is committed and reproducible | `.github/branch-protection.json` + `scripts/apply-branch-protection.sh` |
| A pull request with failing checks cannot merge | branch protection `required_status_checks` (see e2e report) |
| Direct pushes and force-pushes to main are refused | branch protection `allow_force_pushes:false`, PR required (see e2e report) |

## Pre-existing / unrelated failures

None. `main` had no tests; this change introduces the suite and all 112 pass.

## Pending manual steps

Applying branch protection (`scripts/apply-branch-protection.sh`) is a
maintainer action requiring repo admin (Rule 6) and must run after the `test`
check has reported once. The script's read-only slug resolution was verified
(`esneiderbravo/speclaw`); no repository settings were mutated by the agent.

## Verdict

✅ Green across lint/format, strict build, and the type-checked `node:test` suite
at an enforced 80% coverage floor (actual 97.80/91.80/98.04).
