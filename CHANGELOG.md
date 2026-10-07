# Changelog

All notable changes to this project are documented here. Speclaw follows
[Semantic Versioning](https://semver.org/) for the published npm package.

## [Unreleased]

## [2.0.14] — 2026-10-07

### Changed

- `speclaw init` creates a single agent-facing folder by default: `.agents/`,
  with symlinks to `ai-specs/` (`skills`, `commands`, `agents`, `rules`).
  `ai-specs/` stays the source of everything. `.claude/`, `.cursor/`,
  `.codex/`, `.windsurf/` and `.github/instructions/` are created only for an
  agent chosen explicitly (`--agents claude`, `speclaw agent add cursor`, …).
  Existing installs keep their folders.

### Fixed

- `speclaw drift --reseal` re-stamps only the anchors whose sealed state
  changed. Unchanged anchors keep their `archivedAt` / `commitSha`, so an
  unchanged capability stays byte-identical and drift age counts from the real
  seal. On this repo a full reseal went from ~6,000 changed lines in 15 files
  to 6 lines in 1 file.

## [2.0.13] — 2026-10-07

### Changed

- Cortex is as fast as one agent: one brain does the critical path and the
  installed `Stop` hook (`speclaw ship-on-stop`) records the change, runs the
  gates once, writes the report from their real output, and archives level-0
  work with no agent turns. Measured: 18.1 s median vs 15.8 s for an agent
  alone on the same bug, down from 74–154 s (`docs/benchmarks/cortex-speed.md`).
  Extra agents run only in parallel for large independent parts; review
  happens on the PR. Cortex status updates are off by default.

### Added

- `speclaw ship <change>` / `lawbook_change` action `ship`: one call for
  finished work. It never records a review verdict.
- `scripts/bench-workflow.sh`: reproducible agent benchmark.

### Fixed

- `compass_find` (and the `compass_search` / `compass_recall` aliases) returns
  one compact JSON document that always parses and fits `maxTokens` as a
  whole (default 1500): hits carry only `name`, `kind`, `file`, `line`
  (no node ids, signatures, ranking signals, or route); `tokens` counts the
  emitted text; `truncated: true` appears only when hits, rendered blocks,
  nearest entries, or entries of `focusIgnored` / `focus` / `terms` were
  removed (a cut list reports its original length in `focusIgnoredTotal` /
  `focusTotal` / `termsTotal`), so a worktree with many changes or a long
  exact query no longer overflows the cap. `speclaw search|recall --json` keep
  their shape.
- `compass_explore` and `compass_diff_context` with `mode: "full"` are no
  longer cut at the brief ceiling, and a full-mode truncation hint no longer
  tells you to use `mode:"full"`. `text()` gains an opt-in budget (an output
  mode or `{ maxTokens }`); its default stays brief.
- Search focus keeps only indexed files: unindexed worktree changes and
  explicit focus paths no longer switch the budget and personalization to the
  focused defaults; `compass_find` lists them in `focusIgnored`.
- Exact `compass_find` answers whether a name exists: hits are only symbols
  named exactly a query term (`alpha beta` is an OR, reported as `terms`); a
  missing name returns `found: false`, empty `hits`, and up to five `nearest`
  names.
- Types now have callers: TS/JS type annotations and `extends`/`implements`
  clauses become `ref` edges, resolved only through the file's import binding
  or a same-file definition. `compass_explore` and `speclaw explore` list them
  with `via: "ref"` (calls carry `via: "call"`); impact, affected tests,
  PageRank, hotspots, coupling, the map, visualize, and `deps`/`graph` laws
  ignore them. **Compass schema 12**: the first index after upgrading
  re-extracts every file once (embeddings reused); speclaw 2.0.12 or older
  rebuilds a schema-12 index from scratch, so pin every speclaw and the MCP
  entry to 2.0.13.
- `speclaw lawbook draft --bug` (and `lawbook_change` action `draft` with
  `bug: true`) without a level no longer confirms its own level: `change.json`
  carries no `confirmedLevel`/`confirmedBy`/`confirmedAt`, `bugfix.md` says
  `Level: unconfirmed`, and validate applies level-3 bug rules until a level
  is set.
- Cortex `advance` and `rework` re-read the confirmed level from
  `change.json` (unconfirmed → 3), so a level set after `start` takes effect
  and an unconfirmed change never skips planning. `pauseForQuestions` outside
  stage `planning` is rejected with an error (exit 1 on the CLI) instead of
  advancing and dropping the questions.
- An empty target set proposes no level (`level: null`, `degraded:
  ["no-targets"]`) instead of a measured level 0, and `lawbook_change` action
  `level` mode `set` / `promote` without paths or symbols keeps the proposal
  already stored in `change.json`. `promote` on a change with no confirmed
  level is rejected ("use mode 'set'") instead of recording a promotion from
  an undefined level.
- A generic type parameter (`<Props>`) now hides a same-named type only inside
  its own declaration, not across the whole file.

## [2.0.12] — 2026-10-07

### Fixed

- `speclaw laws scan` and `speclaw verify` keep reporting injection findings
  when `speclaw.lock` is unreadable. `laws scan` names the lock error and exits
  1; `laws scan --json` now exits 1 on a lock error or an error finding, like
  the text mode, and adds a `lockError` field.
- `--question` on `speclaw cortex advance` (and `lawbook harness`) is truly
  repeatable: each flag is one open question, and commas no longer split it.
- `speclaw doctor` suggests `git checkout HEAD -- speclaw.lock` for an
  unreadable lock, which also works during a conflicted merge.

## [2.0.11] — 2026-10-07

### Added

- Compass re-indexes each file an agent edits. For Claude Code, `init` /
  `update` add one `PostToolUse` command hook on
  `Write|Edit|MultiEdit|NotebookEdit` that runs the new `speclaw
  reindex-file`: it reads the hook payload from stdin, hands the edited path to
  a detached child and exits 0 at once (about 60 ms), silent, offline, and never
  logged as a Compass call. New symbols are findable mid-session without a
  manual `compass_index`. Binary resolution matches the session-start hook; an
  older speclaw rejects the unknown command and touches nothing. Hooks you added
  to `PostToolUse` are kept.
- `speclaw reindex-file <paths…>` re-indexes specific files in the foreground.
  Per-file runs skip PageRank, cache eviction and the `docs/compass.md` map;
  they mark the index so the next full `speclaw index` (or session start) does
  the full pass.

### Fixed

- Editing a file no longer drops or misattributes its cross-file callers in
  `compass_impact` / `trace`: edges are detached before a file's nodes are
  replaced, so a reused node id can't point at the wrong symbol.
- A full `speclaw index` no longer fails or drops a file when a per-file
  reindex writes concurrently; it takes the write lock before reading stored
  state, keeps rows the walk would still yield, and always closes its
  connection on a busy lock. Removed files also drop their file-level coverage
  links.

### Changed

- Existing installs see `.claude/settings.json` as `refreshedDiverged` once on
  `speclaw update`, as the reindex hook group is added.

## [2.0.10] — 2026-10-07

### Fixed

- Affected tests now find the tests that actually exercise a symbol. Calls
  inside `test(...)` / `it(...)` callbacks and imports in files with no
  declarations are owned by a hidden per-file node, multi-line imports are
  parsed in full, and `tsconfig`/`jsconfig` `paths` and `baseUrl` aliases
  resolve (nearest config, relative `extends`, JSONC). Pure re-export barrels
  (`export * from …`, Nx-style libraries) resolve too.
- Method calls on package receivers (`path.parse()`, `_.map()`) and global
  builtins (`test`, `fetch`) no longer bind to same-named project functions,
  so they stop producing false callers, impact dependents, and coupling
  pairs. A receiver counts as a package only when its import does not
  resolve to a project file.
- `compass_explore` callees list only resolved symbols; unresolved names are
  summarized in `unresolvedCallees` (count and sample) instead of crowding out
  real callees.
- The affected-tests `command` is never a run-nothing command: it is `null`
  with a `commandReason` when nothing is affected. The runner is detected per
  nearest `package.json` (vitest, jest, `node --test`, inherited from a hoisted
  root), workspace-spanning selections get per-workspace `commands`, and
  `node --test` commands drop coverage flags and keep flag values.
- Edges that pointed at deleted nodes after a file was re-extracted are reset
  and re-resolved, so `compass_impact` / `trace` no longer lose callers.

### Changed

- Compass schema **11** (`edges.is_member`, `edges.spec`). The first
  `speclaw index` after upgrading migrates 10→11 and re-extracts every file
  once, reusing embeddings. A speclaw ≤2.0.9 (including a pinned MCP entry)
  rebuilds a schema-11 index from scratch — run `speclaw update` so the pinned
  MCP entry moves to 2.0.10.
- Calls on local variables and parameters (`svc.run()`) no longer produce
  callers; impact and affected-test counts may rise because the graph is now
  accurate.

## [2.0.9] — 2026-10-06

### Added

- `speclaw update` upgrades itself. When npm reports a newer release during the
  run, it re-executes as `npx -y @esneiderbravo/speclaw@<latest> update` with
  the same flags (also in CI and on a non-TTY), so the latest release applies
  its own migrations, and exits with that run's code. It migrates with the
  installed binary instead when you opt out (`--no-self-update` or
  `SPECLAW_NO_SELF_UPDATE=1`), when the registry is unreachable (a cached
  version only), or when `npx` cannot be started. `init` still only advises.
- `--help` / `-h` on every command prints that command's usage to stdout and
  exits 0. It writes nothing, contacts no registry, and starts no server or
  watcher (before, `speclaw init --help` ran `init` and `speclaw mcp --help`
  started a server).
- `speclaw laws lock --force` lists each drifted strict file with its locked
  and on-disk digests, asks for confirmation (default No), then re-baselines
  them and records an `accepted[]` entry for each (`--note` adds the reason).
  Interactive TTY only: without a TTY, when declined, or when a file changed
  while the prompt was open, it exits 1 and leaves the lock untouched.

### Changed

- The agent MCP entry is pinned to the installed version
  (`npx -y @esneiderbravo/speclaw@<version> mcp`) by `init`, `agent add`, and
  `update`. On the first `speclaw update`, an existing stock (unpinned) entry
  is re-pinned; a custom entry (e.g. a local `node` path) is kept.
- The `lawbook_change` action `archive` result reports `harnessCompleted`, and
  the `cortex` MCP tool's `status` and `brief` read an archived change instead
  of failing. `start`, `advance`, and `rework` on an archived change are
  rejected without writing.

### Fixed

- Security: a lock refresh (`init`, `update`, `laws compile`, `laws lock`) no
  longer re-baselines a strict file (`CLAUDE.md`, `AGENTS.md`, compiled rules)
  edited outside speclaw. The drifted file keeps its locked digest and the
  command warns `run speclaw laws accept <path>`, so `verify` keeps failing
  until a human accepts it. Clean and new strict files and advisory files are
  refreshed as before, and stale `accepted[]` entries are pruned.
- An existing `speclaw.lock` that cannot be read (merge-conflict markers, a
  newer `lockfileVersion`, or valid JSON with the wrong structure) is never
  rebuilt: every refresh leaves it byte-identical and reports the error, and
  `init`, `update`, `laws compile`, `laws lock`, and `laws accept` exit 1.
  `speclaw doctor` suggests repairing or restoring it from git rather than a
  bare `laws lock`.
- Archiving a change completes its Cortex harness. The archive moves the
  harness from `archiving` to `done` (one history entry) before it moves the
  change directory, and restores it if the move fails; the `cortex` skill and
  the archiver agent no longer call `advance` after an archive (it failed once
  the change had moved). The six archived changes of 2026-10-06 left stuck in
  `archiving` are repaired to `done`.

## [2.0.8] — 2026-10-06

### Added

- Cortex status summary. The `cortex` MCP tool's `status` action and
  `speclaw cortex status` return a `summary` before `state`: the stage, the
  active role, whole minutes in the stage, tasks done/total (from the
  `tasks.md` checkboxes, or `record.md` at level 0), the rework
  iteration/max, the pending verdicts, the open-question count, the
  configured interval, and a one-line English `line`. `summary` is `null`
  when the change has no harness yet. The MCP input schema is unchanged.
- `speclaw cortex status` also prints `summary.line` to stderr; stdout stays
  one JSON document, and `--json` suppresses the stderr line.
- Coordinator status updates. During a Cortex run the `cortex` skill posts a
  compact update after every Cortex op and before every blocking role
  dispatch, in the session's language (stage, role, and tool names, paths, and
  change names stay in English). Where the host has a session timer (Claude
  Code `CronCreate`) it also keeps exactly one recurring timer per run, skips
  pings while the run waits on the human's answers (`questions`), and deletes
  the timer at `done`, when the run stops, or when the human asks to stop.
- `cortex.statusIntervalMinutes` in `lawbook/config.yaml` sets the update
  interval: default 5, `0` disables every unsolicited update, values above 60
  are capped at 60, and a missing or invalid value means 5.

### Changed

- On the MCP path (`cortex` and the deprecated `lawbook_change` `harness`
  alias), `status` is fitted to the output budget so the JSON stays valid and
  `summary` stays complete: the oldest `state.history` entries are dropped and
  counted in `historyOmitted` (`state` becomes `null` with `stateOmitted` if
  even an empty history does not fit). The CLI and `harness.json` keep the
  full history.

## [2.0.7] — 2026-10-06

### Added

- Session-start refresh for Claude Code. `speclaw init` / `speclaw update` add
  one `SessionStart` command hook (matcher `startup|resume|clear|compact`,
  30 s timeout) that runs the new `speclaw session-start` command. It resolves
  the binary as `node_modules/.bin/speclaw` → `speclaw` on `PATH` →
  `npm_config_update_notifier=false npm_config_offline=true npx --no-install
  @esneiderbravo/speclaw`, so it never contacts a package registry. It is
  silent, always exits 0, and skips when `.speclaw/index.db` is absent — the
  first build stays `compass_index` / `speclaw index`. An older speclaw on
  `PATH` rejects the unknown command and touches nothing. Hooks you added to
  `SessionStart` are kept.
- `speclaw session-start` refreshes an existing index without writing to the
  Compass call log, the branded header, or the update notice.

### Changed

- `speclaw index` takes a no-op fast path when nothing changed (no file
  re-extracted or removed, root hash unchanged, no `--force`, `--prune`, or
  explicit `--max-cache-mb`): it skips `dir_hashes`, edge and import
  resolution, PageRank, and embedding-cache upkeep, still advances
  `indexed_at`, and leaves `docs/compass.md` alone unless its map block is
  empty. On this repo the unchanged-index median drops from ~385 ms to
  ~205 ms (M1 Max, Node 24).
- Existing installs see `.claude/settings.json` as `refreshedDiverged` once on
  the first `speclaw update`, as the `SessionStart` group is added.

### Fixed

- `compass_explore` returns the exact symbol source. It sliced the file as
  UTF-8 bytes with UTF-16 offsets, so any multibyte character before a symbol
  (`—`, `«»`, `ñ`, emoji) shifted the snippet early and cut its end. Stored
  data was never affected: no reindex, schema bump, or drift reseal needed.

## [2.0.6] — 2026-10-06

### Changed

- The brand follows the speclaw site's design tokens. The CLI palette, the
  Compass HTML viewer, and every asset under `brand/` take the dark **ink**
  theme (paper `#131313`, ink `#f4f4f3`, signal `#00e3fd`, deny `#ff5c47`);
  the light banner and mark take the **bond** theme (signal `#00707f`). Green
  and amber stay for success and warning, re-tuned to at least 4.5:1 on
  `#131313`. The `c.*` helpers keep their names.
- The brand SVGs draw the site mark (a document whose last line, the law, runs
  past the page edge) and set text in Chivo / Chivo Mono instead of SF Mono /
  JetBrains Mono. The README badges use the bond signal (`00707f` on
  `131313`).
- `npm run brand` renders the PNGs with Chivo loaded from the new dev
  dependencies `@fontsource/chivo` and `@fontsource/chivo-mono` (decoded from
  WOFF2 by the dev dependency `wawoff2`), never from system fonts. A missing
  font file stops the render with a non-zero exit that names the file. None of
  these ship in the published package.

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

## [2.0.3] — 2026-10-03

### Fixed

- `compass_explore` and `search` resolve a repo-relative file path to a symbol
  in that file. An exact symbol name still wins. A path such as `src/foo.ts`
  no longer returns zero similar symbols.

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
