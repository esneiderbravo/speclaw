# Tasks — add-verify-ci

- [x] **Step 0: Create the feature branch (must be first).** `feat/verify-ci`.

## Core
- [x] `src/shared/git.ts`: `mergeBase(projectPath, ref)` and
      `changedFiles(projectPath, base)` using `merge-base` + `diff --name-only`
      three-dot range. Reuse `isShallowRepo` from `git-history.ts` in the
      orchestrator; do not re-implement `git log`.
- [x] `src/modules/foundation/verify.ts`: when `readLawManifest` returns null,
      evaluate `seedManifest()` in memory (never an empty pass if the seed has
      batch laws).
- [x] `src/modules/foundation/laws.ts`: `mergeSeedLaws` / `ensureLawManifest`
      appends seed laws whose `id` is absent; never overwrites existing entries.
- [x] `src/modules/foundation/ci.ts`: `--fail-on` ranking, exit codes 0/1/4,
      fingerprint `lawId:file:line`.
- [x] `src/modules/foundation/sarif.ts`: `toSarif(report, ctx)` — SARIF 2.1.0,
      one rule per loaded law, relative URIs, skip notifications, 5.000 cap.
- [x] `src/modules/foundation/report-md.ts`: `toMarkdown(report)` — laws table +
      skipped details; no coverage claims.
- [x] `src/cli/commands/verify.ts`: thin CLI; `--ci` / `--sarif` / `--json` /
      `--format` / `--fail-on` / `--strict-engines`; writes `$GITHUB_STEP_SUMMARY`
      when set; exit 2 on bad flags, 3 on `--ci` + shallow or unwritable sarif.
- [x] Wire `verify` into `src/cli/index.ts` dispatch + HELP; do **not** add it
      to `HEADER_COMMANDS`. Keep `check` and `laws verify`.

## Scaffold / CI packaging
- [x] Seed `deps`/`graph` laws in
      `src/modules/foundation/assets/laws/laws-manifest.json` for speclaw's
      architecture (`shared` ↛ `modules`/`cli`; `compass` ↛ `foundation`;
      no module cycles).
- [x] `ensureVerifyWorkflow` in `scaffold.ts`: write
      `.github/workflows/speclaw.yml` from the asset iff missing.
- [x] Asset `src/modules/foundation/assets/workflows/speclaw.yml`:
      `pull_request` only, `permissions: {}`, `fetch-depth: 0`, verify job
      `contents: read` + `security-events: write`, `uses: esneiderbravo/speclaw@v1`.
- [x] `action.yml` at the package root: Node 24, `index` then `verify --ci`.
- [x] `.github/workflows/speclaw.yml` dogfood: local `npm ci && npm run build &&
      node dist/cli/index.js index && verify --ci` (not npx of the last release).
- [x] `MIGRATIONS` entry `0.3.4` with an agent prompt to make the check required
      in branch protection.

## Mandatory gates
- [x] Review and update the affected tests (seed is no longer path-only;
      no-manifest verify uses the seed; scaffold writes the workflow if missing).
- [x] Add tests: `test/unit/sarif.test.ts`, `test/unit/ci-verdict.test.ts`,
      `test/unit/markdown-report.test.ts`, `test/unit/git-diff.test.ts`,
      `test/unit/assets-workflows.test.ts`, extend `test/integration/verify.test.ts`
      + `scaffold.test.ts`, extend `test/e2e/cli.test.ts` for exit codes.
- [x] Run the quality gates and verify they pass (`npm run check`, `npm run build`,
      `npm test`).
- [x] Perform manual verification of the behavior — the agent executes this
      itself, never the user. Isolated throwaway repo only.
- [x] Produce the discipline reports under `reports/` (`backend.md`, `api.md`,
      `security.md`, `e2e.md`, `infra.md`).
- [x] Update the technical documentation touched by the change (README: `speclaw
      verify`, exit codes, Action one-liner, "no model / no API key / no network").
- [x] Bump the version to 0.3.4.
- [x] Archive the change within the same PR (`lawbook:archive`).
