# Review — index-at-session-start (re-review after rework 1)

- Change: `index-at-session-start` (level 2, feature)
- Branch: `fix/compass-source-and-session-index`
- Reviewer: Cortex reviewer role
- Date: 2026-10-06
- Scope: rework 1 (design D13, tasks §11). Files read:
  `src/cli/commands/session-start.ts`, `src/cli/index.ts` (dispatch, header,
  notifier), `src/cli/commands/index-build.ts`, `src/modules/foundation/hooks.ts`
  (`SESSION_START_COMMAND`, `isSpeclawHook`, `LEGACY_SESSION_START_MARKER`),
  both delta specs, the design, the proposal, the tasks, `docs/compass.md`
  §Session-start refresh, `test/unit/hooks.test.ts`,
  `test/integration/session-start.test.ts`, and
  `test/integration/index-noop.test.ts`. I also checked the old CLIs on this
  machine: the 2.0.6 global at
  `/usr/local/lib/node_modules/@esneiderbravo/speclaw/dist/cli/index.js`, and
  2.0.2 in `~/.npm/_npx/59cdec84f5848339`.
- Compass calls made: 1 (`compass_explore SESSION_START_COMMAND` found
  nothing, because exported constants are not indexed as symbols). Everything
  else was read directly.

## History

- **Review 1: FAIL.** B1: `npx --no-install` still contacted the registry.
  B2: an older global speclaw ignored `--session-start` and ran a full index,
  which appended to the call log and caused a rebuild loop on pre-2.0
  versions. Non-blocking: N1, N5, N6, N7, N8.
- **Review 2: PASS.**
- **Tester FAIL** (`reports/hooks.md`): npm's update notifier made a registry
  GET on the npx branch despite `npm_config_offline=true`.
- **Review 3 (rework 2): PASS.** See "Rework 2" at the end.

## Verdict: **PASS**

Both blockers are fixed at the root cause, and tests now cover them. The
legacy-marker handling is sound. The docs and specs are consistent with the
new command, and I found no regressions.

---

## Blocker resolution

### B1 — npx branch is offline: resolved

The `else` branch in `hooks.ts:108` is now
`npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start`.

How npm handles this (npm 10, the version bundled with the Node ≥22
`engines` floor):

- `npm_config_*` environment variables are read as config, so `offline=true`
  applies.
- In `libnpmexec`, a spec that is not in the local tree is resolved through
  `pacote.manifest(...)` using the flat options. `npm-registry-fetch` maps
  `offline` to cache mode `only-if-cached`, which overrides `preferOnline`.
- If the packument is not cached, npx fails with `ENOTCACHED` and makes no
  request. If it is cached, npx resolves from the cache. Then `--no` (the
  alias for `--no-install`) refuses to install anything that is missing from
  the `_npx` cache.
- Either way, there is no network access and no install. Any failure is
  absorbed by `>/dev/null 2>&1 || true`. The offline retry cost from B1 is
  also gone, because `only-if-cached` fails at once.

The env assignment applies only to `npx` (a POSIX prefix assignment), so it
does not leak into the other branches.

The test `the npx fallback runs offline and never installs`
(`test/unit/hooks.test.ts:423-440`) narrows `PATH` to an `npx` stub. It
asserts the exact argv `--no-install @esneiderbravo/speclaw session-start`,
`npm_config_offline=true`, exit 0, and empty output. The spec scenario "The
npx fallback runs offline" matches it.

### B2 — older binary on PATH: resolved

- The hook now calls the top-level command `session-start` in all three
  branches. No branch calls `speclaw index` (`hooks.ts:104-109`).
- **2.0.6 global** (`dist/cli/index.js:195-208`):
  - `main()` runs `maybeHeader`, then `dispatch`, then `maybeNotifyUpdate`.
  - `maybeHeader` returns early because stdout is not a TTY under the hook
    redirect, and `session-start` is not in `HEADER_COMMANDS` anyway.
  - `dispatch` reaches `default`, which runs `ui.err("Unknown command")`,
    `console.log(HELP)`, and `process.exit(1)`. The process exits before the
    update notifier runs, before any index import, and before
    `recordCompassCall`.
  - The module-level imports (`args`, `ui`, `update-check`) have no side
    effects at load.
- **2.0.2** (from the `_npx` cache) has the same dispatch shape: unknown
  command, then exit 1, at `index.js:193-204`. Every 2.0.x on this machine
  (2.0.2–2.0.6) therefore does nothing.
- **0.3.x**: no copy is available locally, so this is inferred rather than
  verified. The `dispatch` switch with a default that prints "Unknown command"
  and exits 1 is the same pattern in every build I could inspect. The
  destructive path from B2 required that the old binary *run an index*, and it
  can no longer be reached through any known command. The only way it could
  happen is if a 0.3.x CLI treated an unknown command as `index`. Nothing
  suggests that, and the tester's run of manual check 7.1 with the 2.0.6
  global covers the realistic case.
- Test: `an older speclaw on PATH rejects the command and touches nothing`
  (`test/unit/hooks.test.ts:396-421`). The stub indexes only on `index` and
  exits 1 on anything else. The test asserts that the stub was called once
  with `session-start`, that no index ran, that `.speclaw/` is unchanged, and
  that the run exits 0 with no output.
- The new CLI is silent:
  - `session-start` is not in `HEADER_COMMANDS` (`src/cli/index.ts:79-97`).
  - The update notice is skipped (`src/cli/index.ts:207`).
  - `runSessionStart` does not call `recordCompassCall`.
  - `buildIndex` and the compass module write nothing to the console. I
    grepped `src/modules/compass` for `console.` and `stdout/stderr.write` and
    found no matches.
  - The flag is gone from `index-build.ts`, and `INDEX_HELP` no longer
    mentions it.

### Legacy marker — sound

`isSpeclawHook` (`hooks.ts:164-172`) matches `speclaw session-start` or
`speclaw index --session-start`. Every branch of the pre-release command
contains the legacy substring:

- `node_modules/.bin/speclaw index --session-start`
- `speclaw index --session-start`
- `@esneiderbravo/speclaw index --session-start`

So `mergeHooks` drops the pre-release entry and adds the new one. The unit
merge test (`hooks.test.ts:292-295`) seeds both a stale current-shape entry
and a pre-release entry. The legacy constant is not exported, which keeps it
out of the public surface. A user hook would be misclassified only if its
command contained one of these speclaw-specific literals, which is an
acceptable risk. The delta spec ("Idempotent hook merge") documents the
legacy marker.

### Prior non-blocking items

| # | Status |
|---|--------|
| N1 | Resolved. Design §3 and §5 now say "Reconciled during implementation" (`compactMapPending`, the cache-cap bypass), D13 is recorded, and the proposal is updated. |
| N5 | Resolved. `runSessionStart` checks `index.db` before lazily importing the indexer, so the no-index path never loads `node:sqlite`. `process.removeAllListeners("warning")` runs before the import. `ExperimentalWarning` is emitted through `emitWarning` on the next tick, so removing the listeners first suppresses it. The integration test still asserts empty stderr. |
| N6 | Still open (non-blocking). See R2. |
| N7 | Resolved. Triggers now also cover `edges` and `embedding_cache` (`index-noop.test.ts:32`), with a forced-run check showing the `edges` trigger is live. |
| N8 | Resolved. `docs/compass.md:167-170` states the 30 s kill, the rollback, and the repeat, and tells the user to run `speclaw index` once. |

## Consistency check (leftover `--session-start`)

I grepped the repo outside `node_modules`, `dist`, and `.speclaw`. The flag
now appears only in these places:

- `hooks.ts` (the legacy marker, on purpose);
- `test/unit/hooks.test.ts:294-295` (the legacy-merge test, on purpose);
- the delta and design text that describes the legacy marker or the D13
  history;
- the code-graph delta clause "`speclaw index` SHALL have no `--session-start`
  flag";
- `harness.json` history notes;
- `tasks.md` §2 and §4.3, which are marked "Superseded in rework" (see R1).

`docs/compass.md`, the compass template, `README.md`, `CLAUDE.md`, `AGENTS.md`,
and the CLAUDE template all reference `speclaw session-start`. The benchmark
imports `SESSION_START_COMMAND` from the branch build, so it follows the
rename automatically.

## Spec ↔ implementation

| Requirement | Impl | Tests | Status |
|-------------|------|-------|--------|
| `req~session-start-hook~1` (offline npx, no `index` subcommand, silent, exit 0) | `hooks.ts:104-115,224-230` | `test/unit/hooks.test.ts:248-271,358-450` | Met. Every scenario is covered, including the older binary and the offline npx branch. |
| Idempotent merge (current marker plus legacy marker) | `hooks.ts:84-91,164-172,246-263` | `hooks.test.ts:273-331` | Met. |
| `req~session-start-index~1` | `src/cli/commands/session-start.ts:16-28`; `src/cli/index.ts:23,155-156,207` | `test/integration/session-start.test.ts` (6 tests, one per scenario) | Met. |
| `req~index-noop-fast-path~1` | unchanged since review 1 | `index-noop.test.ts` (triggers extended) | Met. |

## Remaining non-blocking recommendations

| # | Where | Finding | Suggested action |
|---|-------|---------|------------------|
| R1 | `tasks.md:37-48`, `tasks.md:93` | The superseded §2 sub-bullets and the 4.3 bullet "`--help` lists the flag" still describe the flag. The section header marks them superseded, so this is cosmetic. | Optional: strike through, or reword 4.3 to "help lists `session-start`; `index --help` does not". |
| R2 (was N6) | `test/unit/hooks.test.ts` | There is still no case for a `CLAUDE_PROJECT_DIR` that contains a space or does not exist. I re-read the quoting and it is correct. | Optional: add the two cases. |
| R3 | `hooks.ts:108` | npm's own update notifier, which checks for new npm versions once a week, also honors `offline`. If you want defense in depth against any npm-version quirk, add `npm_config_update_notifier=false` to the prefix. The scenario substring would still match if it goes after `npm_config_offline=true`. | Optional hardening. Not required by the spec. **Correction in review 3:** the premise was wrong. The tester showed that the notifier does *not* honor `offline`. Rework 2 adopted the hardening. |
| R4 | tester | The behavior of the real npm offline mode is inferred from npm semantics. The test only proves the stub received the env var. | In manual check 7.1, run the npx branch for real once with `PATH` lacking `speclaw`, if feasible. Record that npx exits non-zero or runs the cached copy without network access (for example, with networking disabled or `npm_config_registry=http://127.0.0.1:9`), and that the hook still exits 0. |

## Not reviewed (owned by tester or release)

The following tasks are still open:

- 5.2: benchmark numbers;
- 6.1: the quality gates;
- 7.1: manual verification, including the older-binary case;
- 8.1: the discipline reports;
- 9.2–9.4: dogfood, `laws accept`, and the release;
- 10.1: archive.

The tester must report real gate output. This review does not claim that the
gates pass.

---

## Rework 2 (review 3)

- Scope: only the fix for the tester FAIL in `reports/hooks.md` (npm's update
  notifier made a registry GET on the npx branch).
- Compass calls made: 1 (`compass_explore SESSION_START_COMMAND` found nothing
  because it is an exported constant). The rest was read and grepped
  directly.

### Verdict: **PASS**

### Findings

- **Correctness** (`src/modules/foundation/hooks.ts:106-111`). The npx
  branch is now
  `npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start`.
  This disables the notifier GET that the tester reproduced, and the tester's
  own experiment with this prefix recorded 0 requests (`hooks.md:80`). The
  docblock (`hooks.ts:98-102`) explains why `offline` alone is not enough.
- **POSIX sh.** Several `NAME=value` prefix assignments before a simple
  command are valid POSIX. They are exported to `npx` only and do not
  persist into the other branches. Quoting, the `{ …; }` group, and
  `|| true` are unchanged.
- **Spec consistency** (`specs/law-enforcement/spec.md`). The requirement
  text (224-226) names both settings. The scenario "The npx fallback runs
  offline" (269-277) adds `npm_config_update_notifier` = `false`. The
  substring in the scenario "installed without laws" (244) still matches,
  because `npm_config_offline=true npx --no-install …` stays contiguous.
- **Design consistency.** D13 (`design.md:24`), the narrative at 45-51, and
  the command at 73 all match the constant byte for byte.
- **Docs consistency.** `docs/compass.md:160-165` matches. `CLAUDE.md` and
  `AGENTS.md` only say "offline `npx --no-install`", which is still accurate.
  The foundation templates make no npx claims, so nothing is stale.
- **Settings consistency.** The `SessionStart` command in
  `.claude/settings.json:150` is byte-identical to the string that
  `SESSION_START_COMMAND` concatenates to.
- **Tests.** In `test/unit/hooks.test.ts:423-444`, the stub records
  `$npm_config_offline $npm_config_update_notifier` and the test asserts
  `"true false"`. Argv, exit 0, and empty output are unchanged. The integration
  regex at `test/integration/hooks.test.ts:63` still matches.
- **Regressions.** None found. The other branches, the guard, the marker
  matching in `isSpeclawHook`, and the legacy-merge logic are untouched.

### Non-blocking

- **R5** (`test/unit/hooks.test.ts:343-348`). `runHookCommand` inherits
  `process.env`. If the test process already has `npm_config_offline=true`
  or `npm_config_update_notifier=false` (for example, from a developer's
  `.npmrc` under `npm test`), the npx-branch assertion would still pass if
  the prefix were removed. Optionally pass `npm_config_offline: ""` and
  `npm_config_update_notifier: ""` in that test's env override, so that only
  the hook command can make the assertion pass.
- **Tester re-run.** The tester should re-run the trap-server check from
  `hooks.md` against the shipped command and record 0 requests.
