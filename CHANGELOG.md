# Changelog

All notable changes to this project are documented here. Speclaw follows
[Semantic Versioning](https://semver.org/) for the published npm package.

## [Unreleased]

## [2.0.5] — 2026-10-06

### Changed

- The **Publish to npm** workflow also pushes the `v<version>` tag and creates
  the GitHub release from the version's `CHANGELOG.md` section. It skips a tag
  or release that already exists and fails before tagging if the section is
  missing.

### Fixed

- `speclaw.lock` no longer pins the `.claude/rules/speclaw` symlink (it points
  into the gitignored `ai-specs/`),
  so `speclaw update` stops flipping `symlinks` between `{}` and that entry
  depending on whether the link exists locally. Locks written by older versions
  that still pin it only warn in `speclaw verify` when the link is missing or
  retargeted, instead of failing clean CI clones with "Managed symlink
  missing". The next `speclaw update` or `speclaw laws lock` drops a legacy
  entry once; after that the lock stays stable. Other managed symlinks still
  fail verify.

## [2.0.4] — 2026-10-06

### Added

- Compass-first evidence gate. `cortex advance` out of `exploring` or
  `implementing` checks for Compass calls (explore, find, diff-context and
  their aliases; `compass_index` does not count) logged to
  `.speclaw/compass-calls.jsonl` since the stage started. `compassGate:
  off|warn|strict` in `lawbook/config.yaml` (default `warn`); `strict` rejects
  the advance without touching `harness.json`.
- Compass-first nudge: a `PostToolUse` `Read|Grep|Glob` hook adds context
  telling the agent to use `compass_find` / `compass_explore` when it reads
  indexed code without a recent Compass call. Context only — never a
  permission decision — and reads no longer evaluate laws.
- `speclaw lawbook draft <name> [--level N] [--capability C]` and the
  `lawbook_change` action `draft` scaffold a feature change that validates out
  of the box. Placeholder deltas are refused by sync.
- `compass_index` / `speclaw index` report graph `totals` and a `nextStep`.
- `scripts/bench/compass-first.mjs` benchmarks main vs a branch (micro and
  headless agent runs, each against its own build).

### Changed

- Packaged skills, agents, commands, rules and templates name only canonical
  MCP tools. The explore skill locates with `compass_find` first and indexes
  only when that returns nothing; the Cortex skill dispatches the explorer
  with symbols and questions and batches all human questions into one round.
- Existing installs show the updated hooks as `refreshedDiverged` on
  `speclaw update`.

## [2.0.2] — 2026-10-02

### Changed

- Cortex planning reuses a complete explorer brief. The packaged explore,
  cortex, and draft skills, and the planner agent, no longer tell the planner
  to re-locate the code or re-read standards the brief already covered.
  `speclaw update` refreshes `ai-specs/skills` and `ai-specs/agents` from this
  package.

## [2.0.1] — 2026-10-01

### Fixed

- `speclaw update` no longer runs `npm install -g`. It only applies project
  migrations and prints an advisory if a newer binary exists on npm (upgrade
  the CLI separately via `npm i -g` or `npx @esneiderbravo/speclaw@latest`).

## [2.0.0] — 2026-10-01

### Added

- **Cortex** (*One brain. Many agents.*) — multi-agent coordination module:
  durable `harness.json`, MCP tool `cortex` (`status` / `start` / `advance` /
  `rework` / `brief`), CLI `speclaw cortex`, skill `/lawbook/cortex`, and role
  agents (explorer → planner → implementer → reviewer → tester → archiver).
- Archive gates on harness review/test verdicts; build skill hands off before
  final gates.
- `docs/cortex.md` + README / brand art for the Cortex loop.
- Nine canonical MCP tools (was eight).

### Changed

- Package version **2.0.0**; GitHub Action pin for consumers: `esneiderbravo/speclaw@v2`.
- Domain agent packs removed; empty packs catalog by default.

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
