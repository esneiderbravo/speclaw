# Review — harden-update-lock-and-cli

- **Role:** reviewer (Cortex)
- **Change:** `harden-update-lock-and-cli` (level 3, feature + 3 defects)
- **Date:** 2026-10-06
- **Branch:** `feat/coordinator-status-updates`
- **Scope:** only this change's additions. `coordinator-status-updates` (already
  archived) is out of scope except where this change routes `status.ts` through
  `resolveChangeDir`.
- **Inputs:** proposal, design D1–D20, tasks, the 4 delta specs, `LAWS.md`,
  `docs/standards/*`, the implementation, the tests, and `reports/.red-{2,3,4}.txt`.
- **Engine check:** `lawbook_change validate` gave `valid: true`, with EARS style warnings only.

## Verdict: **FAIL**

Most of the work is solid. Self-update, the MCP pin, harness completion with the
archived resolver, and per-command help all match the specs and are well tested.
The lock change fixes the reported laundering path. But it leaves two security
gaps in the same requirement, and one delta scenario contradicts the engine.
Those need to be fixed before this change can pass.

---

## Blocking findings

### B1 (High): an unreadable or newer-version `speclaw.lock` is silently replaced with a fresh baseline, which launders drift

- `src/modules/foundation/lock.ts:354-360`: `readLockfileOrNull` swallows every
  `readLockfile` error. That covers a JSON parse error (for example, git
  conflict markers left in `speclaw.lock` after a merge) and an unsupported
  `lockfileVersion`.
- `src/modules/foundation/lock.ts:434-436`: `refreshLockfile` then treats
  `prev` as `null`. In that case `drifted` is `[]` and every strict path is
  re-baselined from disk. `buildLock` then overwrites the lock, so a lock
  written by a newer speclaw is also downgraded.
- This path is reached by `init`, `update` (scaffold), `laws compile`, the MCP
  setup path that calls scaffold, and `laws lock` without `--force`. None of
  them needs a human or a TTY.
- `verifyIntegrity` reports the same corrupt lock as an error
  (`test/unit/integrity.test.ts:39-45`, `integrity~lockfile~1`). After any
  refresh, though, verify passes with the tampered digests baked in. This is
  the defect class this change sets out to close (`req~lock-preserves-drift~1`,
  `req~laws-accept-human~1`).
- The spec only allows a baseline from disk "WHEN no lockfile exists"
  (`specs/law-enforcement/spec.md:985-986`). A lockfile that exists but cannot
  be read is not that case.
- `src/modules/foundation/scaffold.ts:201` says "`speclaw laws lock` surfaces
  errors". That is no longer true: `laws lock` goes through the same swallowing
  reader and rewrites the lock.

**Rework:**
- Keep `null` only for a lockfile that does not exist.
- When the file exists but cannot be read or has an unsupported version, make
  `refreshLockfile` throw without writing. The `try/catch` blocks in
  `scaffold.ts:243-247` and `compile-laws.ts:256-260` already leave the lock
  untouched in that case.
- Make `laws lock` exit non-zero with the parse or version error. A human
  repair (or `laws lock --force` on a TTY, if you choose) stays the only way
  forward.
- Do the same in `driftedStrictPaths`'s default argument, or let it propagate.
  Scaffold's `try` at `scaffold.ts:198-202` already handles it.
- Fix the comment at `scaffold.ts:201`.
- Add regression tests: a garbage lock and a `lockfileVersion: 99` lock, each
  followed by `scaffold(refreshManaged)` / `compileLaws` / `runLock`. The lock
  bytes must be unchanged. Record red-before-green evidence in `security.md`.

### B2 (Medium-High): `laws lock --force` has a TTY check but no confirmation

- `src/cli/commands/laws.ts:164-173`: `--force` checks only
  `lawsTty.isInteractive()` and then re-baselines **every** drifted strict file
  at once, without prompting. `laws accept`, the existing human path, also
  needs an explicit `clack.confirm` (default `false`; `laws.ts:230-237`).
- Any process with a pseudo-terminal can run `--force` with no interaction.
  That includes an agent driving an IDE's integrated terminal, or
  `script -q /dev/null speclaw laws lock --force`.
- Spec conformance:
  - `req~laws-accept-human~1` (`specs/law-enforcement/spec.md:1129-1131`):
    "SHALL require interactive TTY **confirmation** via `speclaw laws accept`
    or via `speclaw laws lock --force`."
  - `req~laws-integrity-cli~1` (`specs/cli/spec.md:589-590`): "`accept` and
    `lock --force` SHALL be interactive."

**Rework:**
- After the TTY check, compute `driftedStrictPaths`. If it is non-empty, list
  the paths with their expected and actual digests, then ask
  `clack.confirm({ initialValue: false })`.
- On cancel or "no", exit 1 and leave the lock byte-identical.
- Optionally take `--note`, as `accept` does, and record it in each
  `accepted[]` entry next to `"laws lock --force"`.
- Make the confirm injectable alongside `lawsTty`.
- Tests: confirm "yes" re-baselines and records acceptance; "no" or cancel
  exits 1 and leaves the lock unchanged.

### B3 (Medium, must be fixed before sync): a `lawbook-workflow` delta scenario cannot happen

- `specs/lawbook-workflow/spec.md:1131-1135` ("A change without a harness
  archives as before … archive SHALL succeed … `harnessCompleted` false") can
  never be satisfied. `harnessArchiveBlockers`
  (`src/modules/cortex/harness.ts:405-409`, `req~harness-archive-gate~1`)
  blocks any archive whose `harness.json` is missing.
- The implementer recorded this deviation, and the test covers the function
  instead (`test/unit/harness.test.ts:268-273`). The canonical spec would still
  gain a scenario that contradicts another requirement, though.

**Rework:** rewrite the scenario so it matches what ships. For example: "Given
a change with no `harness.json` … archive SHALL be blocked by the harness gate
… and `completeHarnessOnArchive` SHALL create no `harness.json` and report
`completed` false". Alternatively, drop the scenario and keep the "a `done`
harness is left unchanged" case, which already returns `harnessCompleted: false`
through `specArchive` (`harness.test.ts:281-283`).

---

## Non-blocking findings (fix if cheap, otherwise record as follow-ups)

- **N1 (hardening, D12): the self-update version string reaches the Windows
  shell unvalidated.**
  - `src/cli/lib/self-update.ts:58-70` filters the forwarded argv, but
    `${opts.pkg}@${opts.version}` is passed to `spawn(..., { shell: true })` on
    Windows.
  - `version` comes from the registry body (`update-check.ts:45-46`) and is not
    validated. `isNewer` accepts strings like `"9.9.9 & calc"`.
  - The registry is trusted over HTTPS, and npx installs from the same source
    anyway. Still, the claim "the Windows shell spawn cannot be injected" is
    only half true.
  - Fix: validate `version` against a strict semver charset (for example
    `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`) before spawning. Treat a mismatch as
    "no latest" and migrate in process.
  - Also: on Windows, `shell:true` turns a missing `npx.cmd` into exit code
    `ran` 1 instead of `unavailable`, so the in-process fallback never runs.
    Document this in `cli.md` (tests are POSIX-only).
- **N2 (residual risk, spec-sanctioned): new strict files are baselined
  automatically.**
  - A strict path absent from the previous lock (for example a new
    `.github/instructions/evil.instructions.md` written by an agent) is added
    to the lock by any refresh (`lock.ts:436`, `lock.test.ts:173-184`).
  - This is what the spec says (`specs/law-enforcement/spec.md:976`), but it is
    a laundering path for new files.
  - Follow-up idea: auto-add only strict paths that `compileLaws` wrote during
    this run; warn about any other new strict path.
- **N3 (docs accuracy): help advertises flags the handlers do not read.**
  - `src/cli/lib/help.ts:390` advertises `coverage --strict, --only-defects,
    --tags, --requirement`. `runCoverage` reads only `adopt`, `write`,
    `change`, `json`, and `tap`.
  - `help.ts:405` advertises `drift --since <rev>`. `runDrift` does not read it.
  - Remove them, or wire them up. Task 6.1 also tells the tester to run
    `speclaw coverage --only-defects`, which the CLI silently ignores. Use the
    `lawbook_change` action `coverage` with `onlyDefects` instead.
- **N4 (test strength): the "no update notice" assertion cannot fail.**
  `test/e2e/cli.test.ts:394` asserts no notice on stderr. But
  `maybeNotifyUpdate` already returns when stderr is not a TTY
  (`update-check.ts:153`), and `spawnSync` stderr is always a pipe. The help
  short-circuit in `main()` is correct by inspection; the test just cannot
  catch a regression. A unit test that `main` returns before `maybeNotifyUpdate`
  would be needed for that.
- **N5 (wording): `archiver.md` contradicts itself.**
  `src/modules/lawbook/assets/agents/archiver.md:13-15` (and the mirror in
  `ai-specs/agents/archiver.md`) says "do not call a Cortex op afterwards",
  then tells the agent to call `cortex` `status`. Say "do not call a
  *mutating* Cortex op (`advance`/`rework`/`start`)".
- **N6 (consistency): `brief` still lists `advance` for the archiving stage.**
  `src/modules/cortex/brief.ts:65-71` returns `nextOps: ["advance"]` for
  `archiving`. The new guidance is "archive, don't advance". Consider
  `nextOps: []`, or a hint naming `lawbook_change archive`.
- **N7 (audit trail, D9 consequence): `accepted[]` entries are pruned by the
  next refresh.** An `accepted[]` entry from `laws accept` or `--force` is
  pruned the next time compile rewrites that file (`lock.ts:463-465`). The
  audit trail then lives only in git history. That is fine per D9, but the
  README sentence about the audit trail (`README.md:315`) should say so.
- **N8 (by design, D1): a stale binary pins the MCP entry to its own version.**
  A stale binary running `agent add` or `update --no-self-update` re-pins the
  stock MCP entry *down* to its own version (`src/shared/agents.ts:147-162`).
  Mention this in `cli.md`.
- **N9 (cosmetic):** `update` is in `HEADER_COMMANDS`, so after a re-exec the
  parent's header and the child's header both print.
- **N10 (cosmetic):** inside scaffold, `compileLaws` refreshes the lock
  (`compile-laws.ts:256-260`) and scaffold refreshes it again
  (`scaffold.ts:243-245`). The result is consistent because both use the same
  `drifted` snapshot, but it is a redundant write.
- **N11 (test seam): `archiveFs` is a mutable exported object in product code.**
  `src/modules/lawbook/engine.ts:633-635` exports `archiveFs`, as does the
  `lawsTty` seam. This is acceptable, but a comment marking it as test-only
  would help.

## Focus-area verification (what passed)

1. **Lock security (apart from B1/B2):**
   - The drift snapshot is taken before any write:
     - `scaffold.ts:197-202` runs before `renderFoundation`, `configureAgent`,
       and `compileLaws`.
     - `compile-laws.ts:226` runs before any artifact write.
   - So speclaw's own managed-region rewrites of a clean file are refreshed
     (`lock.test.ts:159-170`, `integrity.test.ts:83-91`), and a user or agent
     edit is kept (`integrity.test.ts:69-80`). The red evidence is in `.red-2.txt`.
   - Only `laws.ts:173` passes `rebaseline`. No MCP tool reaches it, and the
     MCP tool count is unchanged.
   - `--force` without a TTY exits 1 before reading the lock
     (`integrity.test.ts:94-109`).
   - Pruning matches the spec (`lock.ts:463-468`, `lock.test.ts:187-202`).
   - A `missing` file is not treated as drift (D14).
   - Advisory paths are refreshed freely (D8).
2. **Self-update:**
   - The loop guard `SPECLAW_SELF_UPDATED` is set in the child env
     (`self-update.ts:61`) and checked before spawning (`update.ts:358`).
   - Migrations never run twice: after a `ran` outcome the parent sets
     `process.exitCode` and returns (`update.ts:369-373`).
   - `fresh` is true only after a fetch in this call (`update-check.ts:96-104`),
     so an offline or cached `latest` never re-executes.
   - `--check` returns before the spawn. The opt-outs work as specified,
     including the `self-update:false` spelling.
   - The CI and non-TTY paths are not gated (D7).
   - `child_process` appears only in `self-update.ts`, and the ban test is kept.
   - Unit tests stub the spawn, and no e2e test runs `update`, so tests make no
     real network calls.
   - `self-update.test.ts` uses a fake `npx` on a temp `PATH`.
   - The 2.0.8 MIGRATIONS entry was added; the 2.0.1 entry is unchanged.
3. **MCP pin:**
   - The stock-shape detection (`agents.ts:101-114`) follows design §2.
   - Foreign or custom entries are kept and reported.
   - `update` reaches `configureAgent` through scaffold (`scaffold.ts:231`).
   - This repo's `.mcp.json` and `.cursor/mcp.json` use custom `node …/dist/cli/index.js mcp`
     entries, so they are correctly left untouched. No refresh is needed, which
     is consistent with D20.
   - Side note, out of scope: both files hold a plaintext credential in another
     server entry. They are gitignored (`.gitignore:10,38`), so nothing leaks
     through this change.
4. **Harness:**
   - The harness is completed before the rename and restored if the rename
     fails (`engine.ts:611-617`). Tested at `harness.test.ts:291-307`, and the
     red evidence is in `.red-3/4`.
   - It is idempotent: a `done` harness is left unchanged.
   - Resolver precedence is correct: the active dir wins, then the newest
     exact-match archive (`paths.ts:31-47`, `harness.test.ts:254-265`).
   - Mutating ops on an archived change are rejected before any write
     (`harness.ts:203-208`).
   - `status` and `brief` work, and `status.ts` counts tasks in the archive.
   - Putting `paths.ts` in a leaf module avoids a cycle, and cortex does not
     import lawbook.
   - All 6 repaired `harness.json` files are valid JSON with `stage: done` and
     a final `archiving→done` repair entry.
5. **Help:**
   - `main()` short-circuits before the header, the dispatch, and the notifier
     (`index.ts:150-157`).
   - The dispatcher's known set comes from the registry, and a parity test
     checks the switch cases (`help.test.ts:25-29`).
   - The e2e table covers every command with `--help` and `-h`, a
     byte-identical directory, and a timeout bound for `mcp` and `watch`.
   - `INDEX_HELP` was folded into the registry.
6. **Spec reconciliation and docs:**
   - The implementer's deviations are acceptable, except the harness-less
     scenario (B3):
     - The `query` command does not exist; its usage lives under
       `impact`/`affected-tests`/`diff-context`.
     - `paths.ts` is a leaf module.
     - The test seams are `lawsTty`, `archiveFs`, and `argv`.
   - The `Covers:` tags are present for all 8 requirement ids.
   - README and `docs/cortex.md` are accurate.
   - Reports `cli.md`, `api.md`, `security.md`, `backend.md`, `skills.md`, and
     `docs.md` do not exist yet; producing them is the tester's job (task 8.1).

## Rework checklist

- [ ] B1: refresh refuses to overwrite an unreadable or unsupported lock, fix
  the `scaffold.ts:201` comment, and add tests with red evidence.
- [ ] B2: `laws lock --force` asks for confirmation (default no), lists the
  paths and digests, takes an optional `--note`, and has tests.
- [ ] B3: reconcile the harness-less scenario in
  `specs/lawbook-workflow/spec.md`.
- [ ] Optional this round: N1 (semver check), N3 (help flags), N5 (archiver
  wording).

Compass calls made: 1 (`compass_diff_context`). Line numbers in the index were
stale for the changed files, so source was read directly.

---

## Rework 1 — re-review (2026-10-06)

### Verdict: **PASS**

All three blockers are closed. I checked each one adversarially against the
current tree, not only against the rework summary. No regression found.
Non-blocking residuals are listed below; none of them reopens B1 or B2.

### B1: closed

- `readLockfile` (`src/modules/foundation/lock.ts:108-135`) returns `null` only
  when the file is missing (`existsSync`). It throws, naming `speclaw.lock`, in
  four cases: a parse error, a non-object or `null` body, a missing
  `lockfileVersion`, and `lockfileVersion > LOCKFILE_VERSION` (1).
  `readLockfileOrNull` is gone.
- Direction of the version check: only newer versions are rejected. Since v1 is
  the only format, older versions need no migration. A body with
  `lockfileVersion` 0 or lower is accepted and rewritten as v1, which is
  harmless.
- `refreshLockfile` (`lock.ts:435-476`) reads the lock first, so it throws
  before `writeLockfile`. The `driftedStrictPaths` default argument also throws.
- I listed every writer of `speclaw.lock` with Grep
  (`writeLockfile|refreshLockfile|buildLock`):
  - `refreshLockfile` has three callers: `scaffold.ts:252`,
    `compile-laws.ts:277`, and `laws.ts:242`.
    - All three are guarded by a prior throwing read: the drift snapshot at
      `scaffold.ts:205-209`, `compile-laws.ts:239-245` and `laws.ts:208-215`,
      plus `refreshLockfile`'s own read.
    - If the read fails, `lockError` is set, the write is skipped, and the
      bytes are unchanged.
  - `acceptLockPath` (`integrity.ts:346-371`) reads with `readLockfile` and
    throws before its write.
  - No other writer exists. `owners --write`, `laws scan`, `verify` and
    `doctor` never write the lock.
  - `scaffold` is only called from CLI `init` and `update`; no MCP tool
    reaches it or `compileLaws`.
- Exit codes:
  - `init.ts:124-128` and `update.ts:445-449` set `exitCode = 1`.
  - `laws compile` exits 1 in both json and text mode (`laws.ts:44,56`).
  - `laws lock` exits 1, with or without `--force` (`laws.ts:208-215`).
- Read-only commands still report instead of crashing:
  - `verifyIntegrity` (`integrity.ts:74-96`) catches the error and returns an
    `integrity~lockfile~1` error finding.
  - Doctor (`doctor.ts:646-667`) catches it and reports a
    `cfg.integrity.lock` error.
- N10 is folded in: scaffold passes `refreshLock: false` to `compileLaws`
  (`scaffold.ts:245`), so the lock is written once.
- The stale comment at `scaffold.ts:247` now refers only to compile errors,
  which is accurate.
- Tests: `lock.test.ts:321-367` and `integration/integrity.test.ts:133+` cover
  garbage and v99 locks across `refreshLockfile`, `driftedStrictPaths`,
  `compileLaws`, update-path scaffold, `laws lock` (both modes) and
  `laws compile`.
- Red evidence: `reports/.red-b1.txt` shows 8 of 8 failing before the fix,
  with the downgraded or rebuilt lock bytes visible.

### B2: closed

- `runLock` (`laws.ts:196-259`) runs these steps in order:
  1. The TTY check exits 1 before any read.
  2. The lock is read, and drift is computed (exit 1 if the lock is
     unreadable).
  3. Each drifted path is listed with its locked and on-disk digests.
  4. `lawsConfirm.confirm` is called. It wraps clack with `initialValue: false`,
     and `isCancel` maps to `false`.
  5. On No or cancel, `exitCode` is set to 1 and nothing is written.
- `--note` is recorded as `laws lock --force: <note>`. `laws accept` uses the
  same seam (`laws.ts:299`).
- Can non-interactive input bypass it?
  - `yes | speclaw laws lock --force` fails, because
    `isInteractiveTty` requires `stdin.isTTY && stdout.isTTY`
    (`integrity.ts:379-381`). Piped stdin therefore exits 1 before any read.
  - CI and `</dev/null` fail for the same reason.
  - Remaining exposure: a process that drives a pty can still type "y". That
    is inherent to TTY confirmation, and the spec accepts it. Typing "y" now
    takes an explicit affirmative answer after the digests are shown, which is
    what the spec requires.
- `--force` with nothing drifted shows no prompt and runs a plain refresh. It
  adds no `accepted[]` entries and re-baselines nothing, so it is equivalent to
  `laws lock`. The test is `lock.test.ts:297-309`.
- Tests: confirmed, declined/cancelled (bytes identical, exit 1), nothing
  drifted, and an unreadable lock under force (`lock.test.ts:254-330`).

### B3: closed

`specs/lawbook-workflow/spec.md:1131-1137` now reads "A change without a harness
is blocked and gets no harness". That matches `harnessArchiveBlockers`. The test
asserts both the gate block and `completed: false`. The law-enforcement delta
adds "Force declined leaves the lock unchanged" and "An unreadable lockfile is
never rebuilt" (`specs/law-enforcement/spec.md:1052-1066`), and both match the
code.

### Status of the N items

- **N1:** fixed.
  - `isSafeVersion` (strict semver) is checked in `runUpdate`
    (`update.ts:362`, an invalid version migrates in process) and again in
    `selfUpdate` (`self-update.ts:102`).
  - On Windows, `onPath("npx.cmd")` reports `unavailable` before the shell
    spawn.
  - `SAFE_TOKEN` excludes `%`, `^`, `&`, `|` and spaces.
- **N3:** fixed. `help.ts` no longer lists `coverage --strict/--only-defects/--tags/--requirement` or `drift --since`. The
  remaining `--strict` (doctor), `--strict-engines` (verify) and `--since`
  (hotspots/coupling) flags are real. The spec-side lists are recorded as a
  follow-up.
- **N4:** fixed.
  - `SPECLAW_UPDATE_NOTIFIER=force` (`update-check.ts:155`) lifts only the TTY
    check.
  - The help table sets it, and a control test (`cli.test.ts:~410-425`) proves
    that the notice prints for a non-help command.
  - The assertion can now fail.
- **N5:** fixed. The archiver now says "mutating Cortex op".
- **N6:** fixed. `brief` returns `nextOps: []` for `archiving`. No spec pins the
  old value.
- **N7, N9, N11:** fixed. `README.md:306-318` documents the confirm, the
  default No, the audit-trail lifetime and the unreadable-lock behavior. The
  seams are commented as test-only.
- **N2, N8:** recorded as follow-ups in `tasks.md`. That is acceptable.

### New residuals (non-blocking; follow-ups)

- **R1 (low): `--force` has a time-of-check/time-of-use gap across the prompt.**
  - `drifted` is computed before the confirm prompt, and the prompt can wait
    for any length of time. `refreshLockfile` snapshots the disk again after
    the user confirms.
  - So a strict file edited by a concurrent process while the prompt is open
    has two outcomes:
    - If the file was not in the listed set, it is treated as clean and
      silently refreshed.
    - If it was listed, it is re-baselined to bytes the human never saw.
  - This needs a concurrent writer during a human prompt.
  - Cheap fix: after the confirm, recompute `driftedStrictPaths` and the
    on-disk digests. Abort with exit 1 if the set or any digest changed.
  - `laws accept` has the same pre-existing pattern (`acceptLockPath`
    re-digests after the confirm).
- **R2 (low): a lock that parses but has the wrong structure is coerced, not
  rejected.**
  - For example, `{"lockfileVersion":1,"files":"x"}` or `"files":[]` makes
    `readLockfile` default `files` to `{}`. Every strict file is then baselined
    as "new" on refresh.
  - This is no worse than deleting the lock: that path is already allowed and
    shows up in the git diff.
  - Still, it is inconsistent with "never rebuild an unreadable lock".
  - Consider throwing when `files`/`symlinks`/`accepted` are present with the
    wrong type.
- **R3 (low, pre-existing): `laws scan` skips the scan when the lock is
  unreadable.**
  - `verifyIntegrity` returns early with `findings: []` even for
    `checks: "scan"`.
  - `laws scan` then prints "No injection findings." and exits 0.
  - Scan does not depend on the lock, so run it regardless.
- **R4 (cosmetic): `laws accept` crashes on an unreadable lock.**
  `runAccept` (`laws.ts:274`) does not catch the `readLockfile` throw. The user
  sees an uncaught rejection with a stack trace and a non-zero exit. Nothing is
  written. Route the error through `lockUnreadableMessage` instead.

### Still owed before archive (not reviewer scope)

Tasks 6.1 (gates), 7.1 (manual verification) and 8.1 (the discipline reports
`cli`/`api`/`security`/`backend`/`skills`/`docs`, with `.red-b1.txt` folded
into `security.md`) are the tester's job.

Compass calls made (Rework 1): 1 (`compass_explore readLockfile`, which gave
the source and callers). After that, Grep and Read were used to list every lock
writer exhaustively and to read the changed files.

---

## Rework 2 — re-review (2026-10-06)

### Verdict: **PASS**

R1, R2 and R4 are closed, and the delta spec and README match the code. Nothing
regressed. Two small nits remain; neither blocks.

### R1 (`--force` re-check after the confirmation): closed

- `runLock` (`src/cli/commands/laws.ts:223-247`) builds `confirmed[]` from the
  same values it prints (`path`, the `locked` digest, and `actual` from
  `onDiskDigest`), and passes it as `rebaseline.confirmed`.
- `refreshLockfile` (`src/modules/foundation/lock.ts:561-608`) re-reads the
  lock and takes the snapshot it is about to write. It then calls
  `checkConfirmedDrift` (`lock.ts:499-520`) before any write.
  `checkConfirmedDrift` throws `LockChangedError` in three cases:
  - a newly drifted path that was not listed;
  - a listed path that is no longer drifted (including one that was deleted);
  - a locked digest that is no longer what was shown, or a snapshot digest
    (the bytes that would be written) that is no longer what was shown.
- `runLock` (`laws.ts:254-264`) catches `LockChangedError`, prints "changed
  while the confirmation was open … not written", and sets exit 1.
- `onDiskDigest` (`lock.ts:468-472`) is now shared with `driftedStrictPaths`,
  so the prompt and the re-check digest in the same way.
- Tests (`test/unit/lock.test.ts:363-407`):
  - The confirm seam rewrites the listed `CLAUDE.md` during the prompt.
  - The confirm seam drifts the unlisted `AGENTS.md` during the prompt.
  - In both cases: exit 1, identical bytes, and the `changed while` message.
  - Direct calls cover a stale locked digest, a changed on-disk digest, and an
    empty confirmed set; the matching set succeeds.

### R2 (structural validation in `readLockfile`): closed

- `lockShapeError` (`lock.ts:165-195`) rejects these cases:
  - `files` or `symlinks` present but not a plain object (arrays are
    rejected);
  - a `files` entry without a string `digest`, or with an `ownership` outside
    `strict | advisory | scan-only`;
  - a `symlinks` entry without a string `target`;
  - `accepted` present but not an array of records with a string `path` and
    `digest`.
- Absent fields still default to empty, so older shapes without
  `symlinks`/`accepted` still read. The test is `lock.test.ts:410-417`.
  `laws` and the `accepted[].at`/`by`/`note` fields are deliberately left
  unchecked, which is lenient and safe.
- Ownership parity: `LockOwnership` and `integrityPolicy` (`lock.ts:223-240`)
  produce exactly `strict`/`advisory`/`scan-only`. Lock writers write only
  these three values:
  - `snapshotLockEntries` writes `integrityPolicy` values other than
    `scan-only`;
  - `acceptLockPath` (`integrity.ts:357-361`) writes either the existing
    ownership or `integrityPolicy`, and rejects `scan-only`.

  So no lock that speclaw writes can fail the check.
- Every `readLockfile` caller handles the new throw. The callers are `runLock`,
  `runAccept`, `acceptLockPath`, `refreshLockfile`, `driftedStrictPaths`,
  `verifyIntegrity` (`integrity.ts:74-96`, returns a finding) and doctor
  (`doctor.ts:646`, in a try).
- This repo's `speclaw.lock`, checked statically, passes:
  - `lockfileVersion` is 1;
  - all 19 `files` entries have a string digest and are `strict` or
    `advisory`;
  - `symlinks` is `{}`;
  - both `accepted[]` records have a string `path` and `digest`.
- `dist/modules/foundation/lock.js` contains `lockShapeError` and
  `LockChangedError`, so the build is current.
- Tests: there are 5 new structural rows in the `UNREADABLE_LOCKS` tables of
  `lock.test.ts:445-499` and `integration/integrity.test.ts`. They cover
  `refreshLockfile`, `driftedStrictPaths`, `compileLaws`, update-path
  scaffold, and CLI `laws lock`/`laws compile`.
- Red evidence: `reports/.red-r2.txt` shows 23 of 60 failing before the fix.
  - All 20 structural rows failed, with the rebuilt lock bytes visible.
  - Both prompt-race tests failed.
  - The `laws accept` test failed.

### R4 (`laws accept` fails cleanly): closed

`runAccept` (`laws.ts:297-304`) catches the `readLockfile` throw. The re-read
inside `acceptLockPath` is also caught (`laws.ts:345-352`). Both print
`lockUnreadableMessage`, set exit 1, and write nothing. The test is
`lock.test.ts:420-439`; it checks for no stack frame and identical bytes.

### Spec and docs

- The `law-enforcement` delta (`specs/law-enforcement/spec.md:987-1001`, plus
  the scenario at `:1066-1074` and the structural list at `:1076-1080`) matches
  the code exactly.
- "Accept on an unreadable lockfile fails cleanly" is at `:1206`.
- `README.md:316-322` describes the re-check and the structural cases.

### Nits (non-blocking)

- **N-a (wording):** `laws.ts:345-352` wraps *every* `acceptLockPath` error in
  `lockUnreadableMessage`, including "`<path>` is scan-only" and "File not
  found". For `laws accept .cursorrules`, the user is then told to "resolve
  merge markers … delete it and run `speclaw laws lock`", which is wrong
  advice. Fix: only use `lockUnreadableMessage` for errors that start with
  `speclaw.lock:`, and print other errors as they are.
- **N-b (theoretical):** `checkConfirmedDrift` recomputes drift from disk
  (`driftedStrictPaths`), not from the `files` snapshot it was given. An
  unlisted strict file could be edited before the snapshot and reverted before
  the recompute. Its edited digest would then be written as a clean refresh.
  The window is microseconds and needs an adversarial concurrent writer.
  Computing `now` from `files` against `prev` would close it.
- The `laws accept` prompt-to-write gap is already recorded as a follow-up in
  `tasks.md`.

### Not executed by the reviewer

I did not run `node dist/cli/index.js verify` against this repo's
`speclaw.lock`, because the reviewer role has no shell (Bash is disallowed).
The static check above shows the lock satisfies `lockShapeError`. The tester
should run the read-only `verify` as part of 6.1/7.1 and record the result.

Compass calls made (Rework 2): 0. The session's MCP index is an old build
(shifted source), so the changed files were read directly with Read and Grep.

---

## Rework 3 — re-review (2026-10-06)

### Verdict: **PASS**

R3.1 through R3.4 are done, consistent with each other, and introduce no
regression. Two wording nits remain; neither blocks.

### R3.1/R3.2 (N-a, `runAccept` error routing): closed

- `src/cli/commands/laws.ts:345-355`: an `acceptLockPath` error goes through
  `lockUnreadableMessage` only when its message starts with `speclaw.lock:`.
  Any other error is printed as-is. In both cases `exitCode = 1` and nothing is
  written.
- The prefix test is exact. Every `readLockfile` throw
  (`src/modules/foundation/lock.ts:125-137`: unreadable, not a JSON object,
  missing or unsupported `lockfileVersion`, invalid structure) starts with
  `speclaw.lock:`. The other throws in `acceptLockPath`
  (`src/modules/foundation/integrity.ts:346-373`: "No speclaw.lock — …",
  "File not found: …", "… is scan-only …") do not. All three are raised before
  `writeLockfile`.
- The earlier `readLockfile` catch in `runAccept` (`laws.ts:297-304`) still
  always uses the repair message. That is correct, because only lock read
  errors reach it.
- Test: `test/unit/lock.test.ts:442-462` checks exit 1, identical bytes, the
  scan-only text, no repair advice, and no stack frame.
- Red evidence: `reports/.red-na.txt` shows 1 of 1 failing before the fix,
  with the wrapped "… delete it and run `speclaw laws lock`" text.
- Delta: `specs/law-enforcement/spec.md:1183-1185` adds the sentence, and the
  scenario "Accept on a scan-only path reports that error alone" is at
  `:1216-1224`. Both match the code and the test.

### R3.3 (doctor remedy for an unreadable lock): closed

- `UNREADABLE_LOCK_REMEDY` (`src/modules/foundation/doctor.ts:633-642`) is used
  only for the `cfg.integrity.lock` `error` branch (`:670-678`). It points at
  repair first: resolve the conflict, restore from git, or upgrade for a newer
  `lockfileVersion`. It names delete + `laws lock` only as a last resort and
  says that this re-baselines every pinned file and accepts pending drift.
  That is accurate and safe, and it no longer suggests a bare `laws lock`,
  which would refuse the lock.
- The remedy is non-empty, as the `operational-trust` spec requires. No
  canonical spec pins the old remedy text.
- Test: `test/integration/integrity.test.ts:54-66`.

### R3.4 (release 2.0.9): closed

- `src/cli/commands/update.ts:277-278`: the new MIGRATIONS entry is `2.0.9`,
  after the unchanged `2.0.1` entry.
- `test/unit/update.test.ts:232-234` looks up `version: "2.0.9"`. The `2.0.8`
  values at `:138/163/182` are registry and env fixtures for the self-update
  flow, not the migration version, so they are fine.
- `proposal.md`, `design.md` (D10, §1), `tasks.md`, and the `project-update`
  delta (`spec.md:225-226`) all say 2.0.9. The older reports keep 2.0.8 as a
  historical record, as R3.4 states.

### Nits (non-blocking)

- **N-c:** the remedy's `git checkout -- speclaw.lock` fails on an unmerged
  path during a live conflict ("path is unmerged"). `git checkout HEAD --
  speclaw.lock` (or `--ours`/`--theirs`) works in both cases. This is a
  one-word wording fix.
- **N-d:** `tasks.md` R1.1/R2.1/R2.4 still say the red output "is in
  `reports/.red-b1.txt` / `.red-r2.txt`". Those files are now folded verbatim
  into `security.md`, under headings that keep the file names, so the evidence
  can still be traced. When the tester writes up rework 3, fold `.red-na.txt`
  the same way.

Compass calls made (Rework 3): 2 (`compass_explore runAccept`,
`compass_explore acceptLockPath`). Then Grep and Read were used for
`doctor.ts`, the tests, the delta, and the version strings.

Process note: my first write to this file replaced its contents with a
placeholder. I restored the earlier content word for word from the Rework 2
reviewer's session record (its tail matches what I had read just before) and
then appended this section.
