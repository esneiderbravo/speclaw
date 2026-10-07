# Design — harden-update-lock-and-cli

Level 3, feature change. Items 2, 3, and 4 are defects. Their tasks follow
the bug-grade red-before-green discipline: write the regression test first,
capture its failing output in the report, then fix.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | The MCP entry is pinned to the exact running version, `@esneiderbravo/speclaw@<pkgVersion>`, and is written by `init`, `agent add`, and `update`. | human |
| D2 | When `laws lock` runs with an existing lock, it preserves drifted strict digests and warns `run speclaw laws accept <path>`. Drifted strict paths are re-baselined only with `--force` on an interactive TTY. | human |
| D3 | The five archived `harness.json` stuck at `archiving` are repaired to `done`, with a history entry each. | human |
| D4 | Ceremony level 3. | human |
| D5 | `init` keeps its advisory and never re-executes. | coordinator default |
| D6 | Opt-out flag `--no-self-update` and env `SPECLAW_NO_SELF_UPDATE=1` (any non-empty value). | coordinator default |
| D7 | Re-execution also happens in CI and on a non-TTY. A stale binary migrating in CI is the same defect. | coordinator default |
| D8 | Advisory lock paths (`LAWS.md`, `docs/compass.md`, `docs/standards/*`) keep their free refresh. | coordinator default |
| D9 | The refresh prunes stale or superseded `accepted[]` entries. | coordinator default |
| D10 | Self-update is announced by a new **2.0.9** MIGRATIONS entry. The shipped 2.0.1 entry text is not edited, because shipped entries are cumulative (`project-update`). | coordinator default |
| D11 | Re-execution needs a `latest` that was fetched from the registry **during this run**. An offline, cache-only `latest` makes `npx` fail the same way, so `update` migrates in process with the advisory instead. | planner (offline risk in brief) |
| D12 | Only safe flag tokens (`^--?[A-Za-z][A-Za-z0-9-]*(=[A-Za-z0-9._/:@-]*)?$`) are forwarded to the child. Dropped tokens are named in a warning. `update` takes no positional arguments, so nothing is lost in practice, and the Windows shell spawn cannot be injected. | planner |
| D13 | A child that exits non-zero is propagated (`process.exitCode`). The parent never migrates after spawning the child, so migrations never run twice. | planner |
| D14 | Only `modified` strict entries count as drifted, meaning the disk digest matches neither the lock digest nor an `accepted[]` digest for the path. `missing` keeps today's behavior. | planner |
| D15 | `laws lock --force` records an `accepted[]` entry (`note: "laws lock --force"`) for every path it re-baselines, so a mass re-baseline leaves an audit trail just like `laws accept`. | planner |
| D16 | Archive completes the harness **before** the rename, and restores the old bytes if the rename throws. Completing after the rename would need the archived path, and a crash between the two steps would leave the old defect. | planner |
| D17 | The resolver falls back to the newest `lawbook/changes/archive/<YYYY-MM-DD>-<name>`, matched exactly with `^\d{4}-\d{2}-\d{2}-<name>$`. It is used by every Cortex op. Mutating ops (`start`, `advance`, `rework`) on an archived change are rejected without writing. | planner |
| D18 | Per-command help prints no branded header and no update notice. Help output must be side-effect-free and identical on a TTY and a pipe. | planner |
| D19 | `api.md` is owed: `cortex` `status`/`brief` change for archived names, and the archive result gains `harnessCompleted`. | planner |
| D20 | Strict lock paths in this repo (`CLAUDE.md`, `AGENTS.md`, `.github/instructions/*`, `.coderabbit.yaml`) are not edited by this change. | planner |

## 1. Self-update (`req~update-self-update~1`)

### 1.1 Version source

`checkForUpdates` (`src/cli/lib/update-check.ts:83`) gains an additive field
`fresh: boolean`. It is `true` only when `latest` came from `fetchLatest` in
this call. Existing callers ignore it.

### 1.2 Spawn module (`src/cli/lib/self-update.ts`, new)

```ts
export type SelfUpdateOutcome =
  | { kind: "ran"; code: number }       // child exited; code (signal → 1)
  | { kind: "unavailable"; reason: string }; // spawn ENOENT/EACCES before start

export function safeForwardArgs(argv: string[]): { forward: string[]; dropped: string[] };

export function selfUpdate(opts: {
  pkg: string;          // pkgName()
  version: string;      // latest
  args: string[];       // safeForwardArgs(process.argv.slice(3)).forward
  env?: NodeJS.ProcessEnv;
}): Promise<SelfUpdateOutcome>;
```

- POSIX: `spawn("npx", ["-y", `${pkg}@${version}`, "update", ...args], { stdio: "inherit", env: { ...env, SPECLAW_SELF_UPDATED: version } })`.
- Windows: `spawn("npx.cmd", same args, { shell: true, ... })`. Node ≥ 18.20 /
  20.12 refuses `.cmd` without a shell. D12 keeps the argument charset
  shell-safe.
- An `error` event before `spawn`, or `ENOENT`, resolves `unavailable`. An
  `exit` resolves `ran` with `code ?? 1`.
- `child_process` is imported **only** here. `test/unit/update.test.ts:25-30`
  keeps banning it in `update.ts`.

### 1.3 `runUpdate` flow (`src/cli/commands/update.ts:281`)

`UpdateHooks` gains `selfUpdate?: typeof selfUpdate` and `env?:
NodeJS.ProcessEnv` (default `process.env`).

```
check({force:true}) → {current, latest, updateAvailable, fresh}
if !latest            → warn (unchanged) → migrate
elif updateAvailable:
  print current → latest
  if checkOnly        → hint "speclaw update upgrades itself" → return
  if canReexec        → outcome = selfUpdate(...)
      ran             → process.exitCode = code; return    (never migrate)
      unavailable     → warn reason + binaryUpgradeHint → migrate
  else                → binaryUpgradeHint (+ reason: opted out / offline) → migrate
else                  → ok "Already on latest" → migrate unless checkOnly
canReexec = fresh && !flags["no-self-update"] && !env.SPECLAW_NO_SELF_UPDATE
            && !env.SPECLAW_SELF_UPDATED
```

Confirm how `parseFlags` (`src/cli/lib/args.ts:13`) represents
`--no-self-update`. It may be `flags["no-self-update"]` or `flags["self-update"]
=== false`. Accept both.

### 1.4 Text

- `binaryUpgradeHint`, `upgradeNotice` (`update-check.ts:116`), the
  `src/cli/index.ts:11` usage line, and the `init.ts:49-57` advisory now say:
  `speclaw update` upgrades itself through npx, and `init` users should prefer
  `npx @esneiderbravo/speclaw@latest init`.
- New MIGRATIONS entry `version: "2.0.9"`. Its `describe` is "speclaw update
  re-executes itself at the latest version; MCP entry pinned; lock refresh
  preserves drift". Its `agentPrompt` covers self-update, the opt-outs, the
  pinned MCP entry, and the `laws accept` warning. It ends with the standard
  "Preserve all project-specific wording…" line. The 2.0.1 entry is untouched.
- README, `brand/terminal-quickstart.svg`, and `.github/workflows/publish.yml`
  are reviewed for the old "upgrade the binary separately" advice. Only stale
  wording is changed.

## 2. Pinned MCP entry (`req~mcp-entry-pinned~1`)

`src/shared/agents.ts:74`: replace the constant with
`mcpEntry() = { type: "stdio", command: "npx", args: ["-y", `${pkgName()}@${pkgVersion()}`, "mcp"] }`.
It imports from `src/shared/version.js` only, so the shared layer stays inner.

`writeMcpConfig` (`agents.ts:87`):

- No `speclaw` entry: write the pinned entry, as today.
- The existing entry is **stock-shaped**. That means `command === "npx"`, and
  `args` equals `["-y", X, "mcp"]` where `X` is `pkgName()` or
  `pkgName()@<anything>`. Other keys are only `type`. If the entry differs
  from the pinned one, rewrite it and push `${mcpPath} (speclaw MCP entry
  pinned to <version>)` to `report.written`. If it is equal, skip.
- Any other shape (custom command, local path, extra args or env): leave it
  unchanged and push `report.skipped` with `(custom speclaw entry kept)`.

`update` reaches this function through `refreshAgents`, from scaffold. Verify
that during implementation, and add the call if `applyProjectMigrations` does
not refresh agents.

Risk: a dev checkout running an unpublished version writes a pin that
resolves only after publish. This is acceptable, because `.mcp.json` is
gitignored per-developer wiring.

## 3. Lock refresh preserves drift (`req~lock-preserves-drift~1`)

### 3.1 API (`src/modules/foundation/lock.ts`)

```ts
/** Strict lock paths whose on-disk digest matches neither the locked nor an accepted digest. */
export function driftedStrictPaths(projectPath: string, prev: SpeclawLock | null): string[];

export interface LockRefreshResult {
  lock: SpeclawLock;
  preserved: string[];   // drifted paths whose post-write digest still differs (warned)
  rebaselined: string[]; // --force only
  pruned: number;        // accepted[] entries dropped
}

export function refreshLockfile(
  projectPath: string,
  opts?: { drifted?: string[]; rebaseline?: { by: string } },
): LockRefreshResult;
```

- `drifted` defaults to `driftedStrictPaths(projectPath, prev)`, computed
  inside the function. That default suits `laws lock`, which writes nothing
  first. Callers that write rule files first must compute it **before** those
  writes and pass it in.
- The digest comparison reuses `prepareIntegrityText` + `digestText`, with the
  same bytes that `verifyIntegrity` hashes. It stays in `lock.ts`, so lock does
  not import integrity and no cycle is created.
- Merge: `next = snapshotLockEntries()`. For each `p` in `drifted` with
  `prev.files[p]` present and `next.files[p]` present: if `rebaseline`, keep
  `next` and append `accepted {path, digest: next, at, by, note: "laws lock
  --force"}`. Otherwise, if `next.files[p].digest !== prev.files[p].digest`,
  set `next.files[p] = prev.files[p]` and add `p` to `preserved`.
- Prune: keep an `accepted[]` entry only when `next.files[path]` exists and its
  digest equals the accepted digest. Count the rest in `pruned`.
- Advisory and scan-only behavior is unchanged (D8).
- Return-type change: update every caller (`scaffold.ts:229`,
  `compile-laws.ts:245`, `laws.ts:73`) and the tests.

### 3.2 Call sites

- `scaffold.ts:221-229`: compute `drifted` **before** `compileLaws` (around
  :223), because compileLaws legitimately rewrites managed regions of
  `CLAUDE.md` / `AGENTS.md`. Pass it to `refreshLockfile`. Surface
  `preserved` as `ui.warn` lines through the install report, as a new
  `report.warnings` entry or the existing warning channel:
  `CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md`.
- `compile-laws.ts` standalone `laws compile`: compute `drifted` before its
  writes. Inside scaffold, the scaffold value is passed down, so the
  computation is not done twice after the writes.
- `laws.ts` `lock`: there are no prior writes, so use the default. `--force`
  requires `isInteractive()` (the same TTY check `runAccept` uses at
  `laws.ts:182-184`, injectable for tests). Without a TTY, print an error and
  exit 1 **before** reading or writing the lock. With a TTY, pass
  `rebaseline: { by }`, using the same `by` that accept records.

### 3.3 Specs touched

`law-enforcement` gains `req~lock-preserves-drift~1`.
`req~laws-accept-human~1` names `laws lock --force` as the second TTY-only
path. `project-update` `req~lock-refresh-update~1` gains the drift exception.
`cli` `req~laws-integrity-cli~1` lists `lock --force`.

## 4. Archive completes the harness (`req~harness-archive-completes~1`)

### 4.1 `src/modules/cortex/harness.ts`

- `resolveChangeDir(projectPath, change): { dir: string; archived: boolean } | null`
  returns the active dir if it exists. Otherwise it returns the lexically
  newest `lawbook/changes/archive/*` entry that matches
  `^\d{4}-\d{2}-\d{2}-${escape(change)}$`. Otherwise it returns `null`.
  `changeDir`, `harnessPath`, and `requireChangeDir` (:53-71) go through it.
  `requireChangeDir` still throws when the result is `null`.
- `start`, `advance`, and `rework` on `archived: true` throw `change <name> is
  archived (<dir>); Cortex ops are read-only` before any write. `status` and
  `brief` work. If `status.ts` from `coordinator-status-updates` builds its own
  path, route it through `resolveChangeDir`, so the summary counts tasks in the
  archived dir. Do this only after that change's implementer is done.
- `export function completeHarnessOnArchive(projectPath, change, note):
  { completed: boolean; restore: () => void }`
  - If no `harness.json`: `{completed: false, restore: noop}`.
  - If stage is `done`: `{completed: false}`, and nothing is written.
  - If stage is `archiving`: append `{at, from: "archiving", to: "done", op:
    "advance", note}`, set stage `done`, and write. `restore` writes back the
    original bytes.
  - Any other stage cannot reach it, because the archive gate requires
    `archiving|done`. As defense in depth, throw without writing.

### 4.2 `src/modules/lawbook/engine.ts` `specArchive` (:560-615)

After the preconditions pass and the sync completes, and just before
`renameSync` (~:604):
`const h = completeHarnessOnArchive(projectPath, change, "archived by lawbook archive")`.
Wrap the rename in try/catch: on error, `h.restore()` and rethrow. The
`ArchiveResult` gains `harnessCompleted: boolean`. The import direction
lawbook → cortex already exists (`engine.ts:27`).

### 4.3 Skill and agent text

- `src/modules/lawbook/assets/skills/cortex/steps/02-dispatch-loop.md` (~:33)
  and `src/modules/lawbook/assets/agents/archiver.md`: replace "advance to
  `done` after archive". The new text says that archive completes the harness
  (`harnessCompleted`), that the coordinator must not `advance` afterwards,
  and that it confirms with `cortex status` (stage `done`). Mirror the change
  into `ai-specs/skills/cortex/steps/` and `ai-specs/agents/`.
- `02-dispatch-loop.md` is also being edited by `coordinator-status-updates`.
  Apply this edit after that change's implementer finishes, and keep its
  status-update text.

### 4.4 Data repair (D3)

For each of
`lawbook/changes/archive/2026-10-06-{index-at-session-start,fix-compass-source-offsets,sync-site-theme,lock-regenerable-symlink,release-on-publish}/harness.json`:

- set `stage` to `done`;
- append `{ "at": <repair ISO time>, "from": "archiving", "to": "done", "op": "advance", "note": "repaired: archive moved the change before the harness reached done (harden-update-lock-and-cli)" }`;
- keep 2-space JSON and the trailing newline.

Do not change any other field or file in those archive dirs.

## 5. Per-command help (`req~per-command-help~1`)

### 5.1 `src/cli/lib/help.ts` (new)

```ts
export interface CommandHelp { name: string; aliases?: string[]; usage: string }
export const COMMANDS: readonly CommandHelp[];   // every dispatchable command
export function helpFor(cmd: string): string | null;
export function wantsHelp(args: string[]): boolean; // any "--help" or "-h"
```

- This module cannot live in `index.ts`, because `index.ts` runs `main()` on
  import.
- `INDEX_HELP` (`index-build.ts:7,:25`) moves into the registry entry for
  `index`, and `index-build.ts` reads it from there.
- Each `usage` starts with `Usage: speclaw <name> …` and lists the command's
  flags. It must include `update` → `--check`, `--backup`, `--minimal`,
  `--no-self-update`; `laws` → `lock [--force]`, `accept`, `scan`, `verify`,
  `compile`, `import`; and `index` → `--force`, `--prune`. It also carries the
  existing scenario promises: `lawbook` → `draft <name>`, `--level`, `--bug`,
  `investigate`; `query` → `impact`, `affected-tests`, `diff-context`; search
  and find → `--focus`, `--max-tokens`, `--explain`; and `trace` → call-path.

### 5.2 `src/cli/index.ts`

In `main()` (:201-205), before the header, the notifier, or dispatch: if
`argv[0]` is a known command and `wantsHelp(argv.slice(1))`, write
`helpFor(cmd)` to stdout, set exit code 0, and return. `dispatch` (:130-135)
derives its known-command set from `COMMANDS`, or a unit test asserts that the
two sets are equal, so a new command cannot ship without help. The global
`speclaw help` / `--help` / no-args output is unchanged.

## 6. Tests

| Item | Test | Red first? |
|------|------|------------|
| 1 | `test/unit/self-update.test.ts` (new): `safeForwardArgs`; `selfUpdate` against a fake `npx` on a temp `PATH` (POSIX only; records argv and env, exits 0/3). `test/unit/update.test.ts`: injected `selfUpdate` seam. The cases are: fresh newer → ran, no migrate, exitCode propagated; `--check` → no spawn; `--no-self-update` / env opt-out / `SPECLAW_SELF_UPDATED` / `fresh:false` → no spawn, migrate; `unavailable` → migrate + hint; no latest → migrate. The ban on `child_process` in `update.ts` is kept. | no (feature) |
| 1 | `test/unit/agents.test.ts`: fresh write is pinned; stock unpinned entry is rewritten; stock entry pinned to an old version is rewritten; custom entry is kept. | no (feature) |
| 2 | `test/integration/integrity.test.ts`: write `CLAUDE.md` in a scaffolded temp project, lock, edit `CLAUDE.md`, run the scaffold refresh (update path), then `verifyIntegrity` → `ok:false`, `CLAUDE.md` `modified`. **Fails today.** | **yes** |
| 2 | `test/unit/lock.test.ts`: `driftedStrictPaths`; preserve + `preserved`; clean strict refreshed; new strict added; advisory refreshed; accepted pruning; `rebaseline` re-baselines + accepted entry. CLI `laws lock --force` without a TTY → exit 1, lock bytes unchanged. | **yes** (preserve case) |
| 3 | `test/unit/harness.test.ts` / `test/unit/feature-draft.test.ts`: drive a temp change to `archiving` with PASS verdicts, `specArchive`, then Cortex `status` → stage `done`; `advance` → rejected, no write. **`status` throws today.** Also: harness-less archive → blocked by the harness gate, and `completeHarnessOnArchive` creates nothing (`completed:false`) (rework 1, B3); failed rename restores the bytes (inject or provoke the failure); a `done` harness is left unchanged; skill/agent text has no advance-after-archive. | **yes** |
| 4 | `test/e2e/cli.test.ts`: table over `COMMANDS` × {`--help`, `-h`} in an empty temp dir → exit 0, stdout `/Usage/`, the directory is byte-identical before and after (recursive listing + hashes), no header tagline. The same rows run with `NO_UPDATE_NOTIFIER` **unset** and stderr not containing the notice. The table never starts `mcp`/`watch`, and a timeout bounds each row. **`init --help` writes files today.** | **yes** |

Every new test carries `// Covers: req~…~1`. For red-first items, capture
the failing run (command and the relevant output lines) **before** the fix,
and paste it into the matching report under a "Regression — red before
green" subsection.

## 7. Sequencing

1. Item 4 (help) and item 2 (lock) are independent of the sibling change.
   Start with them.
2. Item 1 (self-update, MCP pin).
3. Item 3 touches `harness.ts` and `02-dispatch-loop.md`, which
   `coordinator-status-updates` is editing concurrently. Implement it only
   after that change's tasks 2.1 and 3.1–3.3 are done, then rebase the edits
   on top.
4. Sync: `coordinator-status-updates` first, then this change (see proposal).

## 8. Risks

- **Re-exec loop:** guarded by `SPECLAW_SELF_UPDATED`. The child also runs
  `latest`, so `updateAvailable` is false there anyway.
- **Offline npx:** D11. A cached `latest` never re-executes.
- **Windows shim:** D12 and the shell spawn. Tests are POSIX-only, and the
  report states this.
- **compileLaws ordering:** the drift snapshot must be taken before
  `compileLaws`. The red-first integration test exercises the real scaffold
  path.
- **Concurrent edits:** §7.3.
- **Dogfood lock:** after this change, a drifted strict file in this repo
  makes `speclaw update` warn instead of re-baselining. That is the intended
  outcome, and only a human `laws accept` resolves it.
