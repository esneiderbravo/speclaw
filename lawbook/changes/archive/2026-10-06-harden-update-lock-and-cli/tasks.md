# Tasks — harden-update-lock-and-cli

Ships in **2.0.9** (one version per change; `coordinator-status-updates` is
2.0.8) on the same branch. The coordinator owns the
version bump and the CHANGELOG entry. Items 2, 3, and 4 are defects. For each,
write the regression test **first**, run it, and save the failing output for
the reports (red before green). Only then fix. Do not edit the strict lock
paths `CLAUDE.md`, `AGENTS.md`, `.github/instructions/*`, or
`.coderabbit.yaml` (design D20).

## 0. Branch

- [x] 0.1 Step 0: Create the feature branch (must be first). The shared
  branch already exists and is checked out:
  `feat/coordinator-status-updates`.

## 1. Per-command help — defect (design §5)

- [x] 1.1 Regression first: in `test/e2e/cli.test.ts`, add the table-driven
  `--help` / `-h` test over every dispatchable command. It runs in an empty
  temp dir and checks exit 0, `/Usage/` on stdout, a byte-identical directory,
  no header, and no update notice. Never start `mcp`/`watch` for real, and
  bound each row with a timeout. Until `COMMANDS` exists, list the commands
  inline. Run it and save the failing output (for example `init --help`
  writes files). Tag it `// Covers: req~per-command-help~1`.
- [x] 1.2 Add `src/cli/lib/help.ts` (`COMMANDS`, `helpFor`, `wantsHelp`) with
  usage text for every command, including the flags listed in design §5.1.
  Fold in `INDEX_HELP` from `src/cli/commands/index-build.ts`. Add
  `// Covers: req~per-command-help~1`.
- [x] 1.3 In `src/cli/index.ts` `main()`, short-circuit `--help`/`-h` before
  the header, the notifier, and dispatch. Make dispatch use `COMMANDS`, or add
  a unit test that the two sets are equal. Switch the e2e table to `COMMANDS`.
  Re-run it green.

## 2. Lock refresh preserves drift — security defect (design §3)

- [x] 2.1 Regression first: in `test/integration/integrity.test.ts`, scaffold a
  temp project, lock, edit `CLAUDE.md` outside the pipeline, run the scaffold
  refresh (update path), and expect `verifyIntegrity` to be `ok:false` with
  `CLAUDE.md` `modified`. Also add the `test/unit/lock.test.ts` preserve case.
  Run both and save the failing output. Tag
  `// Covers: req~lock-preserves-drift~1`.
- [x] 2.2 In `src/modules/foundation/lock.ts`, add `driftedStrictPaths`, the
  `LockRefreshResult` return, the `drifted` / `rebaseline` options, and
  accepted-entry pruning, exactly as in design §3.1. Add
  `// Covers: req~lock-preserves-drift~1`.
- [x] 2.3 In `src/modules/foundation/scaffold.ts`, compute `drifted` before
  `compileLaws`, pass it to `refreshLockfile`, and surface each `preserved`
  path as a warning naming `speclaw laws accept <path>`. In
  `src/modules/foundation/compile-laws.ts`, do the same for a standalone
  `laws compile`. Inside scaffold, reuse the scaffold value. Tag
  `// Covers: req~lock-refresh-update~1` where the refresh is called.
- [x] 2.4 In `src/cli/commands/laws.ts` `lock`, warn on preserved paths. Add
  `--force`, which needs an interactive TTY (an injectable check shared with
  `accept`). Without a TTY, exit 1 before touching the lock. With a TTY,
  re-baseline and record the accepted entries. Tag
  `// Covers: req~laws-accept-human~1` and
  `// Covers: req~laws-integrity-cli~1`.
- [x] 2.5 Finish the `test/unit/lock.test.ts` cases from design §6: clean
  strict, new strict, advisory, pruning, rebaseline, and the CLI `--force`
  without a TTY leaving the lock bytes unchanged. Re-run 2.1 green.

## 3. Self-update and pinned MCP entry — feature (design §1–§2)

- [x] 3.1 In `src/cli/lib/update-check.ts`, add `fresh` to the
  `checkForUpdates` result (additive).
- [x] 3.2 Add `src/cli/lib/self-update.ts` (`safeForwardArgs`, `selfUpdate`,
  with the POSIX spawn and the Windows `npx.cmd` + shell spawn) and
  `// Covers: req~update-self-update~1`. `child_process` stays out of
  `update.ts`.
- [x] 3.3 In `src/cli/commands/update.ts`, extend `UpdateHooks` (`selfUpdate`,
  `env`) and implement the `runUpdate` flow from design §1.3, including the
  `--no-self-update` parse check. Add the **2.0.9** MIGRATIONS entry. Leave
  the 2.0.1 entry untouched. Update the `binaryUpgradeHint` text.
- [x] 3.4 Update the advisory text in `upgradeNotice`, `src/cli/index.ts:11`,
  and the `src/cli/commands/init.ts` advisory. `init` does not re-execute.
- [x] 3.5 In `src/shared/agents.ts`, write the pinned `mcpEntry()` and add the
  stock-shape rewrite and custom-entry keep rules to `writeMcpConfig`. Confirm
  that `update` reaches `refreshAgents`, and wire it if it does not. Add
  `// Covers: req~mcp-entry-pinned~1`.
- [x] 3.6 Add the tests: `test/unit/self-update.test.ts` (new, POSIX
  fake-`npx`), the new `test/unit/update.test.ts` cases (keep the
  `child_process` ban), and the `test/unit/agents.test.ts` pin cases. Tag
  `// Covers: req~update-self-update~1` and
  `// Covers: req~mcp-entry-pinned~1`.

## 4. Archive completes the harness — defect (design §4)

Start only after `coordinator-status-updates` tasks 2.1 and 3.1–3.3 are done.
They edit `harness.ts` and `02-dispatch-loop.md`.

- [x] 4.1 Regression first: in `test/unit/harness.test.ts`, use a temp change
  driven to `archiving` with review and test PASS. Run `specArchive`, then
  expect Cortex `status` to return stage `done`. Run it and save the failing
  output (`status` throws today). Tag
  `// Covers: req~harness-archive-completes~1`.
- [x] 4.2 In `src/modules/cortex/harness.ts`, add `resolveChangeDir` (archive
  fallback) and route `changeDir`, `harnessPath`, and `requireChangeDir`
  through it. Reject `start`/`advance`/`rework` on archived changes without
  writing. Export `completeHarnessOnArchive`. If `src/modules/cortex/status.ts`
  builds its own change path, route it through `resolveChangeDir`.
- [x] 4.3 In `src/modules/lawbook/engine.ts` `specArchive`, complete the
  harness before `renameSync`, restore it on a rename failure, and add
  `harnessCompleted` to `ArchiveResult`. Tag
  `// Covers: req~harness-archive-completes~1`.
- [x] 4.4 Update the skill text in
  `src/modules/lawbook/assets/skills/cortex/steps/02-dispatch-loop.md` and
  `src/modules/lawbook/assets/agents/archiver.md`, so there is no advance after
  archive and the coordinator confirms `done` with `status`. Keep the
  coordinator-status-updates text. Mirror the edit into `ai-specs/` and check
  that `test/integration/scaffold.test.ts` stays green.
- [x] 4.5 Finish the harness tests: `advance` on an archived change is rejected
  without writing; a harness-less archive gives `harnessCompleted:false`; a
  `done` harness is unchanged; a failed rename restores the bytes; the skill
  and agent text have no advance after archive (`test/unit/feature-draft.test.ts`
  or a skill-text test). Re-run 4.1 green.
- [x] 4.6 Repair the five archived `harness.json` files exactly as in design
  §4.4. Show the before and after `stage` in `backend.md`. (Also repaired
  `2026-10-06-coordinator-status-updates`, archived concurrently and stuck the
  same way: six files in total.)

## 5. Review and update the affected tests

- [x] 5.1 Review and update the affected tests. Run
  `speclaw affected-tests --from-diff main`, review every selected file, and
  confirm that `update`, `agents`, `lock`, `integrity` (unit and
  integration), `harness`, `feature-draft`, `e2e/cli`, `integration/scaffold`,
  `skill-steps`, `mcp-budget`, and `contract/registers` are green.

## 6. Quality gates

- [x] 6.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md): `npm run check`, `npm run build`, and
  `npm test`. Also run `lawbook_change validate` for this change and
  `lawbook_change` action `coverage` with `onlyDefects: true` (the CLI
  `speclaw coverage` has no `--only-defects` flag) for `req~update-self-update~1`,
  `req~mcp-entry-pinned~1`, `req~lock-refresh-update~1`,
  `req~lock-preserves-drift~1`, `req~laws-accept-human~1`,
  `req~harness-archive-completes~1`, `req~per-command-help~1`, and
  `req~laws-integrity-cli~1`.

## 7. Manual verification (tester executes it, never the user)

- [x] 7.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user. Use the built CLI in scratch repos
  under `os.tmpdir()` only:
  - Help: run `node dist/cli/index.js <cmd> --help` and `-h` for `init`,
    `update`, `mcp`, `watch`, `laws`, `lawbook`, and `index` in an empty dir.
    Check exit 0, the usage text, and that the dir is still empty.
  - Lock: `init`, then edit `CLAUDE.md`, then `update --no-self-update`. Check
    the warning naming `speclaw laws accept CLAUDE.md`, that `verify` fails on
    `CLAUDE.md`, and that `laws lock` warns and keeps the digest.
    `laws lock --force </dev/null` exits 1 with the lock unchanged.
  - Self-update: put a fake `npx` first on `PATH` and force `fresh` with a
    newer `latest` (a test seam or a registry stub). Check the recorded argv,
    the env `SPECLAW_SELF_UPDATED`, the exit code propagation, and that the
    parent ran no migration. Check that `--no-self-update` and
    `SPECLAW_NO_SELF_UPDATE=1` migrate in process. Do not contact the real
    registry for a write, and do not install globally.
  - MCP pin: after `init`, `.mcp.json` args carry `@<pkgVersion>`. A
    hand-written unpinned stock entry is re-pinned by `update`. A custom entry
    is kept.
  - Harness: draft a scratch change, drive it to `archiving` with PASS
    verdicts, then `lawbook archive`. `cortex status` shows `done`, and
    `cortex advance` is rejected.

## 8. Discipline reports

- [x] 8.1 Produce the discipline reports under reports/ — one per discipline
  touched — with the unit/integration/e2e results for what the feature
  touched. Each follows the required structure and maps every `#### Scenario`
  of the four delta specs. Expected:
  - `cli.md`: per-command help (e2e table), `update` flags/self-update, `laws
    lock --force`, and the pinned `.mcp.json` launcher entry, with the
    **red-before-green** output for the help defect.
  - `api.md` (mandatory): the `cortex` MCP `status`/`brief` contract for
    archived changes; the `lawbook_change` `archive` result `harnessCompleted`;
    the rejection of mutating ops on archived changes; and a note that the MCP
    schemas and the nine-tool count are unchanged. Record how each was
    exercised and that only temp dirs were used.
  - `security.md`: lock drift preservation, TTY-only re-baseline, accepted
    pruning, and the safe-argv / no-shell-injection self-update spawn, with
    the **red-before-green** output for the lock defect.
  - `backend.md`: the harness completion, the resolver, the data repair of the
    five archived harness files, and the lock engine, with the
    **red-before-green** output for the harness defect.
  - `skills.md`: the cortex skill and archiver agent text.
  - `docs.md`.

## 9. Documentation

- [x] 9.1 Update the technical documentation touched by the change:
  - `README.md`: `update` self-upgrades, the opt-outs, the pinned MCP entry,
    and `laws lock --force`;
  - `docs/cortex.md`: archive completes the harness and archived changes are
    readable through `status`/`brief`;
  - the docs page that covers `speclaw.lock` and `laws accept` (find it with
    `compass_find`), for drift preservation and `--force`;
  - stale "upgrade the binary separately" wording in
    `brand/terminal-quickstart.svg` and `.github/workflows/publish.yml`, only
    where it is now wrong.
- [x] 9.2 Hand the coordinator the 2.0.9 CHANGELOG lines: "speclaw update
  re-executes itself at the latest version (`--no-self-update`)", "MCP entry
  pinned to the installed version", "fix(security): lock refresh no longer
  re-baselines drifted strict files; `laws lock --force` (TTY)", "fix: archive
  completes the Cortex harness", and "fix: `--help`/`-h` on every command".

## Rework 1 — review FAIL (reports/review.md)

- [x] R1.1 B1, regression first: garbage (merge-conflict) and
  `lockfileVersion: 99` lock tests for `refreshLockfile`/`driftedStrictPaths`
  and `compileLaws` (`test/unit/lock.test.ts`), the update-path `scaffold`, and
  the CLI `laws lock` / `laws compile` (`test/integration/integrity.test.ts`).
  All 8 failed before the fix; the output is in `reports/security.md` under
  "Rework 1 B1: an unreadable or newer lock was rebuilt from disk".
- [x] R1.2 B1 fix: `readLockfileOrNull` removed. `readLockfile` returns `null`
  only for a missing file and names `speclaw.lock` in its parse error;
  `refreshLockfile` and `driftedStrictPaths` throw before writing.
  `compileLaws`/`scaffold` report `lockError` and leave the bytes unchanged;
  `init`, `update`, `laws compile`, and `laws lock` (with or without `--force`)
  print it and exit 1. Fixed the stale `scaffold.ts` comment. Also N10: scaffold
  passes `refreshLock: false` to `compileLaws`, so it writes the lock once.
- [x] R1.3 B2: `laws lock --force` lists each drifted path with its locked and
  on-disk digests and asks `lawsConfirm.confirm` (clack, default No, cancel =
  No); No/cancel sets exit 1 and writes nothing; `--note` is recorded as
  `laws lock --force: <note>`. `laws accept` uses the same confirm seam. Tests:
  confirmed, declined, nothing-drifted (no prompt), unreadable lock.
- [x] R1.4 B3: replaced the impossible "archives as before" scenario with "A
  change without a harness is blocked and gets no harness"; the test now also
  asserts the harness gate blocks `specArchive`. Updated the design §6 line.
- [x] R1.5 Delta `law-enforcement`: `req~lock-preserves-drift~1` covers the
  confirmation and the unreadable-lock refusal (new scenarios "Force declined
  leaves the lock unchanged" and "An unreadable lockfile is never rebuilt");
  `req~laws-accept-human~1` forbids rebuilding an unreadable lock.
- [x] R1.6 N1: `isSafeVersion` (strict semver) gates the spawn in
  `runUpdate` (mismatch → in-process migration) and again in `selfUpdate`. On
  Windows a missing `npx.cmd` on PATH is reported `unavailable` before the shell
  spawn (`onPath`), so the in-process fallback runs. Tests use a `platform`
  option; the real Windows shell path stays untested on POSIX (record in
  `cli.md`).
- [x] R1.7 N3: removed `coverage --strict/--only-defects/--tags/--requirement`,
  `drift --since`, and `laws scan (--path)` from `help.ts` (no handler reads
  them). The canonical `cli` spec's pre-existing "SHALL be accepted" lists are
  unchanged (unknown flags are still parsed without error); see follow-ups.
- [x] R1.8 N4: `SPECLAW_UPDATE_NOTIFIER=force` lifts only the notifier's TTY
  check; the e2e help table sets it, and a control test proves the notice
  prints for a non-help command (`laws scan --json`) in the same setup.
- [x] R1.9 N5/N6: archiver text says "do not call a mutating Cortex op
  (`advance`, `rework`, `start`)" (asset + `ai-specs/` mirror); `brief` for
  `archiving` returns `nextOps: []` (test added).
- [x] R1.10 N7/N9/N11: README notes the `accepted[]` audit trail lasts until
  the next refresh (git keeps it) and documents the confirm and unreadable-lock
  behavior; the self-update child skips the duplicate `update` header;
  `archiveFs`/`lawsTty`/`lawsConfirm` are commented as test-only seams.

## Rework 2 — re-review residuals (reports/review.md, "Rework 1 — re-review")

- [x] R2.1 R2, regression first: five structurally invalid lock bodies (`files`
  a string, `files` an array, a `files` entry without a string digest,
  `accepted` an object, `symlinks` a string) added to the unreadable-lock tables
  in `test/unit/lock.test.ts` and `test/integration/integrity.test.ts`. All 20
  rows failed before the fix (with the R1/R4 tests below, 23 of 60 failed); the
  output is in `reports/security.md` under "Rework 2 R1/R2/R4: prompt race,
  structurally invalid lock, accept crash".
- [x] R2.2 R2 fix: `readLockfile` rejects a parsed body with the wrong
  structure (`lockShapeError`: `files`/`symlinks` must be objects with string
  `digest` + known `ownership` / string `target`, `accepted` an array of records
  with string `path` and `digest`; absent fields still default to empty) by
  throwing `speclaw.lock: invalid structure (...)`, so every refresh writes
  nothing and the CLI exits 1 exactly as for an unparsable lock. A lock without
  the optional fields still reads (test added).
- [x] R2.3 R1: `laws lock --force` passes what it showed (`confirmed`: path,
  locked digest, on-disk digest) to `refreshLockfile`, which re-reads the lock,
  recomputes the drifted set, and compares the snapshot it is about to write;
  any difference throws `LockChangedError`, nothing is written, and the CLI says
  the files "changed while the confirmation was open" and exits 1. Tests: the
  confirm seam rewrites the listed `CLAUDE.md`, or drifts the unlisted
  `AGENTS.md`, during the prompt (lock bytes unchanged, exit 1); direct
  `refreshLockfile` cases for a stale locked digest, a changed on-disk digest,
  and a new drift. Extracted `onDiskDigest` (shared with `driftedStrictPaths`).
- [x] R2.4 R4: `laws accept` catches the `readLockfile` error (and an error from
  the re-read in `acceptLockPath`) and prints `lockUnreadableMessage` with
  `exitCode = 1`, no stack trace, nothing written. Test via `runLaws` with the
  TTY seam (red in `reports/security.md` under "Rework 2 R1/R2/R4: prompt race,
  structurally invalid lock, accept crash": uncaught `speclaw.lock: unreadable`).
- [x] R2.5 Delta `law-enforcement`: `req~lock-preserves-drift~1` adds the
  post-confirmation re-check and the invalid-structure cases (new scenario
  "Force writes nothing when files change during the confirmation"; "An
  unreadable lockfile is never rebuilt" lists the structural cases);
  `req~laws-accept-human~1` adds the clean `laws accept` failure (new scenario
  "Accept on an unreadable lockfile fails cleanly"). README lock paragraph
  updated to match.

## Rework 3 — tester FAIL (N-a) and release version

- [x] R3.1 N-a, regression first: `test/unit/lock.test.ts` "laws accept on a
  scan-only path reports that error plainly, not lock-repair advice" runs
  `laws accept .cursorrules` against a valid lock on the TTY seam (confirmed)
  and asserts exit 1, lock bytes unchanged, stderr names the scan-only path,
  and stderr has no "delete it" / "speclaw laws lock" / "left unchanged"
  advice. It failed before the fix (the scan-only error was wrapped in the
  unreadable-lock message); the output is in `reports/security.md` under "Rework 3 N-a: scan-only
  accept error wrapped in lock-repair advice".
- [x] R3.2 N-a fix: `runAccept` routes an `acceptLockPath` error through
  `lockUnreadableMessage` only when its message starts with `speclaw.lock:`;
  any other error is printed as-is, `exitCode = 1`, nothing written. Delta
  `law-enforcement` `req~laws-accept-human~1` gains the sentence and the
  scenario "Accept on a scan-only path reports that error alone".
- [x] R3.3 Doctor fix hint: an unreadable or invalid `speclaw.lock`
  (`cfg.integrity.lock` status `error`) no longer suggests a bare
  `speclaw laws lock` (which refuses such a lock). `UNREADABLE_LOCK_REMEDY` in
  `src/modules/foundation/doctor.ts` says to resolve the conflict or restore
  the lock from git (or upgrade for a newer `lockfileVersion`), and offers
  delete + `speclaw laws lock` only as a last resort that re-baselines every
  pinned file and accepts any pending drift. Test in
  `test/integration/integrity.test.ts`. The root-mismatch remedy is unchanged.
- [x] R3.4 Release is one version per change: this change ships as **2.0.9**
  (`coordinator-status-updates` is 2.0.8). The MIGRATIONS entry in
  `src/cli/commands/update.ts`, its test in `test/unit/update.test.ts`, the
  `project-update` delta re-pin scenario, `design.md` (D10, §1),
  `proposal.md`, and this file now say 2.0.9. Earlier reports keep their
  historical 2.0.8 wording.

### Follow-ups (not in this change)

- N2: auto-add only strict paths that `compileLaws` wrote this run; warn on
  any other new strict path.
- N3 spec: the canonical `cli` spec lists `coverage --strict/--only-defects/
  --tags/--requirement` and `drift --since` as accepted, but no handler
  implements them; implement or drop them in a spec change.
- N8: document in `cli.md`/README that a stale binary running `agent add` or
  `update --no-self-update` re-pins the stock MCP entry to its own version.
- R3 (pre-existing): `laws scan` skips the injection scan and exits 0 when
  `speclaw.lock` is unreadable (`verifyIntegrity` returns early with
  `findings: []` even for `checks: "scan"`); the scan does not depend on the
  lock, so it should run regardless.
- `laws accept` has the same prompt-to-write gap R1 closed for `--force`:
  `acceptLockPath` re-digests the file after the confirmation; pass the shown
  digest and abort on a mismatch.
- N-c: the doctor remedy for an unreadable lock (`UNREADABLE_LOCK_REMEDY` in
  `src/modules/foundation/doctor.ts`) should say
  `git checkout HEAD -- speclaw.lock`. The plain `git checkout -- speclaw.lock`
  fails on an unmerged path (`error: path 'speclaw.lock' is unmerged`, exit 1).
  That is the merge-conflict case the remedy names. The tester reproduced this
  in rework 3 re-test RT3-4 (`reports/security.md`).

## 10. Archive

- [x] 10.1 Archive the change within the same PR (lawbook:archive) after
  harness review/test PASS. Reconcile and `sync` the delta specs, then run
  `lawbook_archive`. **Sync order:** `coordinator-status-updates` syncs and
  archives first. This change's `lawbook-workflow` delta is a full copy of
  that change's delta plus `req~harness-archive-completes~1` and one header
  sentence. The copy was re-based on 2026-10-06 onto the sibling's reworked
  delta, which includes `historyOmitted`/`stateOmitted`, the 60-minute cap,
  and the timer-id rules. If the sibling delta changed before its
  sync, re-apply it here first. Re-check `project-update`, `law-enforcement`,
  and `cli` against their canonical specs before sync.
