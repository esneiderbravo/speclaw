# Changelog

All notable changes to this project are documented here. Speclaw follows
[Semantic Versioning](https://semver.org/) for the published npm package.

## [Unreleased]

### Added

- **EARS** requirement linter in `speclaw lawbook validate` / `lawbook_change`
  validate — five molds + complex/unstructured, stable diagnostic codes, rewrite
  suggestions (never auto-edit). Config: `ears.severity` (`strict` default for
  new scaffolds and speclaw), `vagueWords`, `silentCodes`.
- **Property coverage gate** — `Needs: ptest` (source of truth); optional
  `Verification: property` expands effective needs. Recognizes fast-check /
  Hypothesis / Schemathesis near `// Covers:`; does not run or generate tests.
- `fast-check` devDependency + `test/property/ears.test.ts` dogfood property.

### Changed

- `docs/standards/lawbook.md` documents EARS + `ptest`.
- Scaffold `lawbook/config.yaml` includes `ears:` block.

## [0.3.12] — 2026-08-23

### Added

- Adaptive ceremony levels **0–3** from Compass signals (`impact`,
  affected-tests, hotspots); persisted in `change.json`. Missing file ⇒ level 3.
- `speclaw quick <name>` — level-0 scaffold (`record.md` + `reports/`).
- `lawbook_level` MCP + `speclaw lawbook level` (propose / set / promote /
  explain); listed in `MINIMAL_OMIT`.
- Doctor checks for ceremony cuts validity and archived level distribution.
- Optional `ceremony:` block in `lawbook/config.yaml` (cuts default `[3, 8, 15]`).

### Changed

- Validate/archive gates follow the confirmed level (level 0 skips delta sync).
- `LAWS.md` / `docs/standards/lawbook.md` describe level-based artifact volume.

## [0.3.11] — 2026-08-23

### Added

- `compass_hotspots` / `speclaw hotspots` — rank files by recent git activity
  (default **90 days**) and AST health from `node_metrics` (LOC, nesting,
  branches). Two raw axes; `sortBy`: `churn` | `complexity` | `combined`.
- `compass_coupling` / `speclaw coupling <file>` — temporal co-change partners
  with Jaccard `strength`, `in_graph`, and `isTestPair`. Giant commits
  (`maxFilesPerCommit`, default 50) are excluded from coupling math.
- Compass schema **8**: `node_metrics` (forced reindex). Richer
  `fileActivity` in shared git-history (commits / lines / authors).

### Notes

- Descriptions stay honest: relative churn is a research signal, not a
  guarantee; coupling reports facts, not architecture verdicts.
- Both new MCP tools are omitted under `--minimal` exposure.

## [0.3.10] — 2026-08-23

### Added

- `compass_affected_tests` / `speclaw affected-tests` — static reverse
  reachability into test files with a ready-to-run `command` (prefers
  `package.json#scripts.test`, else `node --test`). Supports `--from-diff`.
- Optional `.speclaw/affected.json` (globals, test globs, named targets).
- Compass schema **7**: `files.is_test`, `files.module` (forced reindex).

### Changed

- **Breaking (MCP):** `compass_impact` returns a grouped blast-radius report by
  default (module counts + top-N). Use `format: "flat"` for the prior list
  shape. Resolution is id-first (`exact` | `by-name`); default edges are
  `call` + `import`. Global config/lockfile matches report `blastRadius: "repo"`
  instead of an empty set.
- CLI `impact` renders the grouped summary; `--flat` / `--json` available.

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
