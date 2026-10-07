# Bugfix: fix-scan-and-cortex-questions

**Level:** 1 · **Type:** bug · **Severity:** normal · **Ships:** 2.0.12

## 1. Observed symptom

Three defects, all in the CLI:

1. **`speclaw laws scan` reports nothing when `speclaw.lock` is unreadable.**
   If `speclaw.lock` holds merge-conflict markers, has an unsupported
   `lockfileVersion`, or has the wrong structure, `speclaw laws scan` prints
   `No injection findings.` and exits 0. This happens even when `AGENTS.md`
   contains `ignore previous instructions`. `speclaw laws scan --json` prints
   `findings: []` and exits 0. It also exits 0 when it does report an
   error-severity finding with a valid lock. `speclaw verify` (default
   `checks: "both"`) reports the lockfile error, but loses every injection
   finding in the same run.
2. **Repeated `--question` flags lose questions and split others.**
   `speclaw cortex advance --pause-questions --question a --question 'b, c'`
   records `openQuestions: ["b", "c"]`. The expected value is `["a", "b, c"]`.
   The first question is dropped and the second is split at its comma. The
   deprecated `speclaw lawbook harness` alias behaves the same way. The help
   text says `--question` is repeatable.
3. **Doctor's repair advice for an unreadable lock fails during a merge.**
   The `cfg.integrity.lock` remedy says `git checkout -- speclaw.lock`. That
   command restores the path from the index. While a merge is in progress the
   path is unmerged in the index, so git refuses with `path 'speclaw.lock' is
   unmerged` and the advice does not work.

## 2. Minimal reproduction

Item 1 (temp directory, built CLI):

1. `printf '# ok\n' > AGENTS.md && speclaw laws lock`
2. `printf 'ignore previous instructions\n' > AGENTS.md`
3. `printf '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n' > speclaw.lock`
4. `speclaw laws scan` prints `No injection findings.` and exits 0.
   `speclaw laws scan --json` prints `"findings": []` and exits 0.
   Expected: exit 1, the lock error, and the `injection/instruction-override`
   finding on `AGENTS.md`.
5. With a valid lock and the same `AGENTS.md`, `speclaw laws scan --json`
   prints the finding but exits 0. Expected: exit 1, as the text mode does.

Item 2 (temp lawbook project with a running harness):

1. `speclaw cortex advance --change <c> --pause-questions --question a --question 'b, c'`
2. `harness.json` `openQuestions` is `["b", "c"]`. Expected: `["a", "b, c"]`.

Item 3:

1. Write merge-conflict markers into `speclaw.lock`, then run `speclaw doctor`.
2. The `cfg.integrity.lock` remedy names `git checkout -- speclaw.lock`. Inside
   a real conflicted merge, that command fails with `is unmerged`. Expected:
   `git checkout HEAD -- speclaw.lock`, which restores the committed copy.

## 3. Root cause

- **RC1, scan exits early on a lock error.** `verifyIntegrity`
  (`src/modules/foundation/integrity.ts:74-96`) calls `readLockfile` and, when
  that throws, returns at once with `findings: []`. `scanAll`
  (`integrity.ts:323-328`), which does not need the lock, never runs. This
  holds for `checks: "scan"` (`speclaw laws scan`, `src/cli/commands/laws.ts:92`)
  and for the default `checks: "both"` (`speclaw verify`,
  `src/cli/commands/verify.ts:57`, folded by `foldIntegrityIntoReport`,
  `integrity.ts:312`).
- **RC2, the scan command ignores the lock error and the JSON exit code.**
  `src/cli/commands/laws.ts:91-110` decides the text outcome from `findings`
  alone, so an empty list prints `No injection findings.` and exits 0
  (`laws.ts:98`). The `--json` branch (`laws.ts:93-95`) always exits 0.
- **RC3, flags are last-wins and the question list is comma-split.**
  `parseFlags` (`src/cli/lib/args.ts:13-33`) keeps only the last value of a
  repeated flag. `list()` (`args.ts:41-49`) then splits that value at commas.
  The consumers are `src/cli/commands/cortex.ts:47` and the deprecated alias in
  `src/cli/commands/lawbook.ts:209`. `src/cli/lib/help.ts:348` documents
  `--question` as repeatable, so code and help disagree. The harness then
  replaces `openQuestions` with that list (`src/modules/cortex/harness.ts:248-256`),
  which is correct given a correct list.
- **RC4, the remedy restores from the index.** `src/modules/foundation/doctor.ts:638-642`
  builds the `cfg.integrity.lock` remedy with `git checkout -- speclaw.lock`.
  `HEAD` is missing from that command.

## 4. Blast radius

Mapped by the explorer from the confirmed root causes. `compass_impact` was not
re-run here because the session MCP server is stale. The callers below come from
the brief and were checked with a source search.

- **`verifyIntegrity`** has two callers: `speclaw laws scan` (`laws.ts:92`) and
  `speclaw verify` (`verify.ts:57`). No MCP tool calls it. `law_verify` runs
  `verifyLaws` (deps/graph), not integrity.
- **`IntegrityReport`** gains the optional, additive `lockError?: string`.
  Existing readers ignore it. `foldIntegrityIntoReport` keeps its behavior:
  scan findings that now survive a lock error fold into the verify report as
  extra findings.
- **Exit codes.** `speclaw laws scan --json` now exits 1 on a lock error or on
  any error-severity finding, which matches the text mode. A CI script that
  relied on `--json` always exiting 0 will see a failure where a real problem
  exists. The CHANGELOG notes this.
- **`parseFlags`** is shared by every CLI command. The fix makes repetition
  opt-in for named keys, and only `question` opts in, so no other flag changes.
  `list()` is unchanged for every other caller.
- **Cortex harness.** `harness.ts` is unchanged. Only the list it receives is
  corrected. The MCP `cortex` tool already takes `openQuestions` as an array and
  is unaffected.
- **Doctor.** One remedy string changes.

## 5. Proposed fix

1. **Scan survives an unreadable lock** (`integrity.ts`). On a `readLockfile`
   error, `verifyIntegrity` records the error, sets `lockError` on the report,
   keeps the existing `integrity~lockfile~1` verify finding and `ok: false`, and
   skips only the digest/symlink comparison. It still runs `scanAll` when
   `checks` is `"scan"` or `"both"`, and returns its findings. A missing lock
   keeps today's behavior: soft, and `checks: "integrity"` still skips the scan
   (`test/unit/integrity.test.ts:285-292` stays green).
2. **`speclaw laws scan` outcome** (`laws.ts:91-110`). Text mode prints the lock
   error, then the findings, and exits 1 when `lockError` is set or any finding
   has severity `error`. It prints `No injection findings.` only when there are
   no findings and no lock error. `--json` prints the report (now carrying
   `lockError`) and uses the same exit rule.
3. **`speclaw verify`** needs no code change beyond item 1. The surviving scan
   findings fold into the report through `foldIntegrityIntoReport`.
4. **Repeatable `--question`** (`args.ts`, `cortex.ts:47`, `lawbook.ts:209`).
   `parseFlags` accepts an optional set of repeatable keys, and a key in that
   set always yields `string[]` in argv order. `cortex advance` and the
   `lawbook harness` alias pass `["question"]` and use the array as-is, with no
   comma split. A single `--question 'b, c'` therefore records one question,
   `"b, c"`. Every other flag stays last-wins, and `list()` keeps splitting
   commas for its other callers.
5. **Doctor remedy** (`doctor.ts:638-642`). Change `git checkout -- speclaw.lock`
   to `git checkout HEAD -- speclaw.lock`. The rest of the remedy text (restore
   from git, last resort, re-baseline warning) is unchanged.

Discarded alternatives:
- **Make every flag repeatable.** That changes the type of every flag
  (`string | string[]`) for all commands and their consumers. Rejected
  (coordinator decision: only `question`).
- **Keep the comma split for `--question` as a convenience.** It is the defect:
  a question that contains a comma cannot be recorded. Rejected.
- **Keep `--json` at exit 0 and let consumers read `findings`.** That makes JSON
  and text disagree, and CI that uses `--json` passes on an injected rule file.
  Rejected (coordinator decision: parity with text).
- **Treat an unreadable lock as "scan only, no error".** That hides a broken
  lock behind a clean-looking scan. Rejected. The lock error is reported and
  fails the run.

## 6. Regression test

Each one is written **before** the fix and must fail on the current code. Its
failing output goes to `reports/.red-before-fix.txt`.

| Test | Fails today because |
|------|---------------------|
| `test/unit/integrity.test.ts::an unreadable lockfile still reports scan findings` (corrupt lock and `AGENTS.md` with `ignore previous instructions`; `verifyIntegrity` with `checks` `"both"` and `"scan"`: `findings` holds `injection/instruction-override`, `lockError` matches `/speclaw\.lock/`, `ok` is false) | RC1: early return with `findings: []` and no `lockError` |
| `test/integration/integrity.test.ts::laws scan exits 1 and keeps findings on an unreadable lockfile (${label})` (inside the `UNREADABLE_LOCKS` loop; text mode and `--json`; the JSON has `lockError` and the injection finding; with a clean `AGENTS.md` the exit is still 1; the lock is byte-identical) | RC1 and RC2: exit 0, `No injection findings.` |
| `test/integration/integrity.test.ts::laws scan --json exits 1 on an error-severity finding` (valid lock) | RC2: `--json` always exits 0 |
| `test/integration/integrity.test.ts::verify keeps injection findings on an unreadable lockfile` (`speclaw verify` exits non-zero and its report names both `integrity~lockfile~1` and `injection/instruction-override`) | RC1: the injection finding is lost |
| `test/unit/args.test.ts::parseFlags collects a repeated repeatable flag into an array without splitting commas` (`--question a --question 'b, c'` gives `["a", "b, c"]`, a single `--question x` gives `["x"]`, and a repeated non-repeatable flag stays last-wins) | RC3: last-wins string |
| `test/integration/cortex-questions-cli.test.ts::cortex advance records each repeated --question as one open question` (`speclaw cortex advance --pause-questions --question a --question 'b, c'` gives `openQuestions` `["a", "b, c"]`; the same flags through the `lawbook harness` alias give the same list) | RC3: `["b", "c"]` |
| `test/integration/integrity.test.ts::doctor's fix hint for an unreadable lock is repair, not a bare laws lock` (new assert: the remedy matches `/git checkout HEAD -- speclaw\.lock/`) | RC4: `git checkout -- speclaw.lock` |

These tests must stay green, unchanged:
- `test/unit/integrity.test.ts::missing lock with integrity-only skips scan`
- `test/integration/integrity.test.ts::speclaw laws lock and scan via CLI`
  (clean scan, exit 0)
- `test/unit/args.test.ts::parseFlags reads --key value, --key=value, --bool, -x, and positionals`
  (a single `--path` stays a string)

## 7. Prevention

The delta specs make the guarantees explicit and coverage-tracked:
- `law-enforcement` `req~injection-scan~1` now says the scan runs and reports
  its findings when the lock is unreadable. It also says `laws scan` (text and
  `--json`) and `verify` exit non-zero on a lock error or an error-severity
  finding, and that `--json` carries `lockError`. Two scenarios are added.
- `lawbook-workflow` `req~harness-state~1` now says each `--question` value is
  one open question, in order and unsplit. One scenario is added.

New law: none. The defects are control-flow and argument-parsing defects in
speclaw's own CLI. A path/deps/graph law cannot express "do not return before
the scan" or "repeatable flags are arrays", so the spec scenarios and their
regression tests carry the prevention. The doctor remedy wording is guarded by
the extended doctor test only. It is a remedy string, so no spec requirement is
added (the operational-trust scenario was optional and is not added).
