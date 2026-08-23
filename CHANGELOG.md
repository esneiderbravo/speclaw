# Changelog

All notable changes to this project are documented here. Speclaw follows
[Semantic Versioning](https://semver.org/) for the published npm package.

## [0.3.9] — 2026-08-23

### Added

- Spec↔code drift: dual `body_hash` / `norm_hash` on Compass nodes, committed
  anchors at `lawbook/anchors/<capability>.json`, `speclaw drift` (table /
  `--json` / `--reseal` / `--reverse` / `--fail-on`), MCP `lawbook_drift`,
  archive-time sealing, doctor check, and `verify --ci` SARIF findings for
  semantic/deleted drift.
- Compass schema **6** (forced reindex); SQLite `spec_anchors` is a projection
  rehydrated from the committed JSON.

### Changed

- Default interactive drift threshold is `--fail-on semantic` (exit 0/1/2).
- Minimal exposure keeps `lawbook_drift` (agents can check drift before declaring done).
  Tool count in minimal profile is now 9.

## [0.3.8] — 2026-08-23

### Added

- Requirement coverage: stable ids (`req~name~rev`), `// Covers:` / `# Covers:` /
  `@covers` comment links, `speclaw coverage` (TAP / table / `--json`, `--adopt`),
  MCP `lawbook_coverage`, and an opt-in archive gate on direct defects.
- Compass schema **5** with derived `coverage_links` rebuilt on index (spec items
  stay on disk, never in SQLite).
- Dogfood: `local-content` capability carries ids + real Covers links.

### Changed

- Minimal exposure keeps `lawbook_coverage` (agents can check coverage before
  declaring done). Tool count in minimal profile is now 9 (`lawbook_drift` stays available like coverage).

## [0.3.7] — 2026-08-22

### Fixed

- Claude Code `mcp_tool` hooks now include an `input` map (`projectPath`,
  `event`, `payload`, …) with `${cwd}` / `${hook_event_name}` /
  `${tool_input.file_path}` substitution. Without it, Stop and other hooks
  called `speclaw_check` with empty args and failed MCP `-32602`.
- `speclaw update` recompiles those hooks in already-scaffolded projects.

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
