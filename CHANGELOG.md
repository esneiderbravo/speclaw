# Changelog

All notable changes to this project are documented here. Speclaw follows
[Semantic Versioning](https://semver.org/) for the published npm package.

## [0.3.6] — 2026-08-22

### Added

- Versioned `speclaw doctor --json` report (`schemaVersion: 1`) with five
  sections, stable check ids, default path redaction, `--offline` / `--strict`
  / `--no-redact`.
- GitHub issue templates requiring doctor JSON on bug reports.
- `speclaw telemetry status` — speclaw ships **no** telemetry.
- Compass writes `meta.indexed_at` for index freshness diagnostics.
- Provenance verification docs and CI/provenance badges in the README.
- Stable install one-liner contract:
  `npx @esneiderbravo/speclaw@latest init`.

### Changed

- Publish workflow runs `check` and `test` before `npm publish` (OIDC trusted
  publishing unchanged).

## [0.3.5] — 2026-08-22

### Added

- Context budget measurement, `speclaw budget`, `--minimal` exposure, JIT
  lawbook skill steps, compact map in `docs/compass.md`.
