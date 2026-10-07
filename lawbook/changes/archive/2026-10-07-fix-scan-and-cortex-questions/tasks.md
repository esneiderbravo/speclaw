# Tasks — fix-scan-and-cortex-questions

Bug change, ceremony level 1, ships as **2.0.12** on branch
`fix/scan-and-cortex-questions`. Root causes, fix, and regression tests are in
`bugfix.md`. The delta specs are `specs/law-enforcement/spec.md`
(`req~injection-scan~1`) and `specs/lawbook-workflow/spec.md`
(`req~harness-state~1`). Both are full copies of the canonical spec, and sync
overwrites the file.

- [x] Step 0: Create the feature branch (must be first). It already exists:
  `fix/scan-and-cortex-questions`. Mark this task when work starts.

## Red first (no `src/` edit until this section is done)

- [x] 1. Write every regression test from `bugfix.md` §6. Tag each one with
  `// Covers: <req id>`:
  - `test/unit/integrity.test.ts`: "an unreadable lockfile still reports scan
    findings" (`req~injection-scan~1`).
  - `test/integration/integrity.test.ts`, inside the `UNREADABLE_LOCKS` loop:
    "laws scan exits 1 and keeps findings on an unreadable lockfile
    (${label})". Run it in text mode and with `--json`, and also with a clean
    `AGENTS.md`. Assert that `speclaw.lock` is byte-identical
    (`req~injection-scan~1`, `req~laws-integrity-cli~1`).
  - `test/integration/integrity.test.ts`: "laws scan --json exits 1 on an
    error-severity finding" and "verify keeps injection findings on an
    unreadable lockfile" (`req~injection-scan~1`).
  - `test/unit/args.test.ts`: "parseFlags collects a repeated repeatable flag
    into an array without splitting commas" (`req~harness-state~1`).
  - New `test/integration/cortex-questions-cli.test.ts`, modeled on
    `test/integration/cortex-status-cli.test.ts`: "cortex advance records each
    repeated --question as one open question". Cover `speclaw cortex advance`
    and the deprecated `speclaw lawbook harness` alias (`req~harness-state~1`).
  - `test/integration/integrity.test.ts:54-66`: add the
    `/git checkout HEAD -- speclaw\.lock/` assert to "doctor's fix hint for an
    unreadable lock is repair, not a bare laws lock" (`req~doctor-integrity~1`).

  Build, run the new tests against the unchanged `src/`, and save the output
  to `reports/.red-before-fix.txt`. Every new case and assert must fail.

## Implementation

- [x] 2. `src/modules/foundation/integrity.ts` (`verifyIntegrity`, lines 74-96):
  - On a `readLockfile` error, keep the `integrity~lockfile~1` verify finding
    and `ok: false`, and set the new optional `IntegrityReport.lockError`
    (a string).
  - Skip only the digest/symlink comparison. Still run `scanAll` when `checks`
    is `"scan"` or `"both"`, and return its findings.
  - Leave the missing-lock path unchanged.
  - Add the `lockError` field to the `IntegrityReport` type with a doc comment.
- [x] 3. `src/cli/commands/laws.ts` (`scan`, lines 91-110):
  - Text mode prints the lock error, then the findings. It exits 1 when
    `lockError` is set or any finding has severity `error`.
  - Print `No injection findings.` only when there are no findings and no lock
    error.
  - `--json` prints the report (with `lockError`) and uses the same exit rule.
- [x] 4. `speclaw verify` (`src/cli/commands/verify.ts:57`): no code change is
  expected. Confirm that `foldIntegrityIntoReport` (`integrity.ts:312`) folds
  the surviving scan findings, and that the verify regression test passes.
- [x] 5. `src/cli/lib/args.ts` (`parseFlags`, lines 13-33):
  - Accept an optional set of repeatable keys. A key in that set always yields
    `string[]` in argv order, for both `--key value` and `--key=value`.
  - Every other key stays last-wins. `list()` is unchanged.
- [x] 6. `src/cli/commands/cortex.ts:47` and `src/cli/commands/lawbook.ts:209`:
  - Parse with `question` repeatable.
  - Pass the array to the harness as-is. Do not split it at commas.
- [x] 7. `src/modules/foundation/doctor.ts:638-642`: change the
  `cfg.integrity.lock` remedy from `git checkout -- speclaw.lock` to
  `git checkout HEAD -- speclaw.lock`, and leave the rest of the text unchanged.

## Verification

- [x] 8. Review and update the affected tests. These must stay green with no
  edit:
  - `test/unit/integrity.test.ts`: "missing lock with integrity-only skips
    scan" and "corrupt lockfile yields error finding".
  - `test/integration/integrity.test.ts`: "speclaw laws lock and scan via CLI".
  - `test/unit/args.test.ts`: the single `--path` string case.

  Justify any changed expectation in the hand-off to the tester.
- [x] 9. Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md):
  - `npm run check`
  - `npm run build`
  - `npm test`
  - `node dist/cli/index.js lawbook validate fix-scan-and-cortex-questions`
  - `node dist/cli/index.js coverage`, with no direct defect for
    `req~injection-scan~1` or `req~harness-state~1`
- [x] 10. Perform manual verification of the behavior. The tester role executes
  this itself, never the user. Use temp directories only, never this repo's
  `speclaw.lock` or `harness.json`. With the built CLI:
  - Run the `bugfix.md` §2 item 1 reproduction. `laws scan` and
    `laws scan --json` exit 1, name `speclaw.lock`, and list
    `injection/instruction-override`. The JSON carries `lockError`, and the lock
    is byte-identical.
  - With a valid lock and a clean `AGENTS.md`, `laws scan --json` exits 0 with
    no `lockError`. With the injected `AGENTS.md`, it exits 1.
  - `speclaw verify` on the unreadable-lock fixture exits non-zero, and its
    output names both the lockfile finding and the injection finding.
  - Run the `bugfix.md` §2 item 2 reproduction. `openQuestions` is
    `["a", "b, c"]`.
  - `speclaw doctor` on a conflicted lock shows
    `git checkout HEAD -- speclaw.lock`. In a temp git repo with a real
    conflicted merge of `speclaw.lock`, that command restores the file.
- [x] 11. Produce the discipline reports under reports/, one per discipline
  touched. Each follows the required structure (see the
  `spec-reports-disciplines` rule):
  - `backend.md`:
    - The red-before-green evidence: copy `.red-before-fix.txt`, then add the
      green run.
    - The gates.
    - A scenario table for every scenario of `req~injection-scan~1` and
      `req~harness-state~1`.
    - The `integrity.ts` and `args.ts` unit results.
  - `cli.md`: the CLI contract this change governs.
    - `laws scan` text and `--json`: the JSON shape with the additive
      `lockError`, and exit 0 or 1 for clean, error finding, and unreadable
      lock.
    - `verify` exit on an unreadable lock with injection findings.
    - `cortex advance` and `lawbook harness` with repeated `--question`.
    - The doctor remedy text.
    - How each was exercised: spawned CLI against temp directories, isolated.

  `api.md` is **not owed**. No HTTP endpoint and no MCP tool's input schema or
  result changes. `verifyIntegrity` has no MCP caller, the `cortex` MCP tool
  already takes `openQuestions` as an array, and `law_verify` runs
  `verifyLaws`, not integrity. The changed contract is CLI output and exit
  codes. `cli.md` documents it with the same rigor as `api.md` (shape, every
  exit code, how it was exercised).
- [x] 12. Update the technical documentation touched by the change:
  - `src/cli/lib/help.ts:348`: confirm `--question` reads as repeatable and that one
    flag is one question (no comma split).
  - `README.md:308` (`speclaw laws scan`): state that it exits non-zero on an
    unreadable `speclaw.lock` or an error finding, `--json` included.

  Hand the 2.0.12 `CHANGELOG.md` `### Fixed` lines to the coordinator (the
  coordinator owns the version bump):
  - "`speclaw laws scan` and `speclaw verify` keep reporting injection findings
    when `speclaw.lock` is unreadable. `laws scan` names the lock error and
    exits 1. `laws scan --json` now exits 1 on a lock error or an error
    finding, like the text mode, and adds a `lockError` field."
  - "`--question` on `speclaw cortex advance` (and `lawbook harness`) is truly
    repeatable. Each flag is one question, and commas no longer split it."
  - "`speclaw doctor` suggests `git checkout HEAD -- speclaw.lock` for an
    unreadable lock, which also works during a conflicted merge."
- [x] 13. Sync the delta specs `specs/law-enforcement/spec.md` and
  `specs/lawbook-workflow/spec.md` into `lawbook/specs/`. They are full copies,
  so first check that the canonical files have not changed since this draft.
- [x] 14. Archive the change within the same PR (lawbook:archive) after harness
  review/test PASS.
