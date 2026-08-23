# Tasks — add-doctor-provenance

- [x] **Step 0: Create the feature branch (must be first).** `feat/doctor-provenance`
      (from up-to-date `main`; do not stack on an unrelated release branch).

## Doctor report core
- [x] Restructure `src/modules/foundation/doctor.ts` into `DoctorReport` /
      sections / stable check ids / status model (`ok|warn|error|skip`); keep a
      compatibility path or update all callers (CLI + MCP register) in the same
      commit set.
- [x] Add `src/modules/foundation/redact.ts` (home → `~`, project → `<project>`,
      username scrub; POSIX + Windows).
- [x] Publish `docs/schemas/doctor-report-v1.json` matching the TypeScript shape.
- [x] Wire CLI flags on `src/cli/commands/doctor.ts`: `--json`, `--offline`,
      `--strict`, `--redact` / `--no-redact`; exit codes per
      `operational-trust` (0 on warnings unless `--strict`).
- [x] Suppress branded header for `doctor --json` in `src/cli/index.ts`.
- [x] Update MCP `doctor` tool to return the JSON report (same schema).

## Checks (implement with honest skip)
- [x] Environment: `env.node` (vs `package.json` engines), `env.platform`,
      `env.git`; `env.ast-engine` → `skip` until the dependency exists.
- [x] Configuration: `cfg.manifest`, `cfg.symlinks` (all configured agents),
      `cfg.mcp.<id>` (unconfigured vs probe-fail vs tool count via self-probe),
      `cfg.laws` (reuse / fold law-enforcement doctor logic), `cfg.budget`
      (reuse measure), `cfg.index.freshness` (needs `indexed_at`),
      `cfg.specs.orphans` via lawbook helpers; `cfg.ownership` / `cfg.hooks` →
      `skip` or `notes` if primitives are incomplete.
- [x] Authentication: `auth.none` constant ok.
- [x] Connectivity: `conn.registry` via registry fetch (skip on `--offline`
      or network failure); `conn.egress` audited list (version check only).
- [x] Notes: compact / capabilities from agent defs + existing law notes.

## Compass freshness primitive
- [x] On successful `compass_index`, write `meta.indexed_at` (ISO). Missing key
      → doctor `skip`, not `error`. No `SCHEMA_VERSION` bump.

## Telemetry posture
- [x] Add `src/cli/commands/telemetry.ts`: `status` succeeds with "no
      telemetry"; `enable`/`disable`/`log` fail clearly; help lists `telemetry`.

## Distribution & provenance (speclaw repo)
- [x] Add `.github/ISSUE_TEMPLATE/bug_report.yml` (required doctor JSON),
      `feature_request.yml`, `config.yml` (`blank_issues_enabled: false`).
- [x] Harden `.github/workflows/publish.yml`: ensure `check` + `test` run before
      publish; keep OIDC (`id-token: write`); no long-lived npm token.
- [x] README: first copy-pasteable install command =
      `npx @esneiderbravo/speclaw@latest init`; sell multi-agent detection in the
      opening; provenance verify section + badges.
- [x] CONTRIBUTING: frozen one-liner contract; trusted-publisher setup; revoke
      classic tokens.
- [x] Add `CHANGELOG.md` starting at this release.

## Release cadence
- [x] Bump `package.json` + lockfile to the next patch (after whatever is on
      `main` at branch time) and add `MIGRATIONS` entry with agentPrompt for
      personalized docs (`doctor --json`, one-liner). **Version bump is
      mandatory** for every roadmap-piece completion.

## Mandatory gates
- [x] Review and update the affected tests.
- [x] Add / extend: `test/unit/doctor-report.test.ts`, `test/unit/redact.test.ts`,
      `test/unit/publish-workflow.test.ts`, `test/unit/distribution-assets.test.ts`
      (README ↔ CONTRIBUTING one-liner), `test/unit/telemetry.test.ts`, extend
      `test/integration/doctor.test.ts` and `test/e2e/cli.test.ts` for
      `--json` / exit codes.
- [x] Run the quality gates and verify they pass (see
      `docs/standards/testing-standards.md`): `npm run check`, `npm run build`,
      `npm test`.
- [x] Perform manual verification of the behavior — the agent executes this
      itself, never the user: `doctor` / `doctor --json` / `--offline` /
      `--strict` on this repo; confirm redaction; confirm issue template file
      present; confirm publish.yml contract; `telemetry status`.
- [x] Produce the discipline reports under `reports/` — `backend.md`, `api.md`,
      `security.md`, `infra.md` (publish workflow + templates).
- [x] Update the technical documentation touched by the change.
- [x] Mark `docs/roadmap/README.md` + `platform/doctor-provenance.md` complete
      locally (gitignored — do not force-add unless asked).
- [x] Archive the change within the same PR (`lawbook:archive`).
