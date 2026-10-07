# Backend checks — fix-scan-and-cortex-questions (2026-10-07)

Date 2026-10-07 · Branch `fix/scan-and-cortex-questions` · Environment: macOS (darwin), Node v24.17.0, cwd `/Users/esneiderbravo/Projects/speclaw`; manual runs in `mktemp -d /tmp/speclaw-man.XXXX` with `HOME` pointed inside it.

Discipline: backend (`src/modules/foundation/integrity.ts` `verifyIntegrity`, `src/cli/lib/args.ts` `parseFlags`/`repeated`, `src/modules/foundation/doctor.ts` `UNREADABLE_LOCK_REMEDY`). The CLI contract is in `cli.md`.

## Gates & results

| Check                   | Command                                                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint + format           | `npm run check`                                                                                                                                                                                                                        | ✅ exit 0 — "All matched files use Prettier code style!", ESLint clean                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Type-check + compile    | `npm run build`                                                                                                                                                                                                                        | ✅ exit 0 — `tsc` clean, "copy-assets: copied assets for 3 module(s)"                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tests + coverage        | `npm test` (full suite, `perl -e 'alarm shift; exec @ARGV' 900 npm test`)                                                                                                                                                              | ✅ exit 0 — `tests 938`, `pass 938`, `fail 0`, `cancelled 0`, `skipped 0`; all files 87.37% line / 84.28% branch / 89.35% funcs (gate 80%)                                                                                                                                                                                                                                                                                                                                                                        |
| Changed-module coverage | same run                                                                                                                                                                                                                               | `src/cli/lib/args.js` 100 / 100 / 100; `src/modules/foundation/integrity.js` 99.39 / 93.55 / 80.00 (uncovered 247-248, outside the change)                                                                                                                                                                                                                                                                                                                                                                        |
| Targeted regression run | `node --test --test-concurrency=1 --test-name-pattern='…' dist-test/test/unit/integrity.test.js dist-test/test/integration/integrity.test.js dist-test/test/unit/args.test.js dist-test/test/integration/cortex-questions-cli.test.js` | ✅ `tests 18`, `pass 18`, `fail 0` (the 13 regression cases, the new bare-flag case, and the 4 must-stay-green tests)                                                                                                                                                                                                                                                                                                                                                                                             |
| Change validation       | `node dist/cli/index.js lawbook validate fix-scan-and-cortex-questions`                                                                                                                                                                | ✅ exit 0 — "fix-scan-and-cortex-questions is valid (2 delta spec(s))"; 84 advisory EARS warnings (multiple-modals / passive-voice), all advisory                                                                                                                                                                                                                                                                                                                                                                 |
| Law verification        | `node dist/cli/index.js verify`                                                                                                                                                                                                        | ✅ exit 0 — "1 passed · 0 failed · 0 skipped · 2 unknown", "No violations." (the 2 unknown are the existing `law~compass-does-not-import-foundation~1` / `law~shared-stays-inner~1` unresolved-reference results)                                                                                                                                                                                                                                                                                                 |
| Requirement coverage    | `node dist/cli/index.js coverage --change fix-scan-and-cortex-questions --json`                                                                                                                                                        | ✅ exit 0 — summary `directDefects 0`, `transitiveDefects 0`; `req~injection-scan~1` (delta spec) covered `utest` + `impl`, no defects. `req~harness-state~1` is declared with the HTML-comment id form (`<!-- id: … -->`), which the coverage index does not pick up (same in the canonical spec), so it is not listed; it carries `// Covers:` tags in `cortex.ts`, `lawbook.ts`, `harness.ts`, `test/unit/args.test.ts` (2), `test/unit/harness.test.ts`, and `test/integration/cortex-questions-cli.test.ts`. |

`docs/compass.md` was backed up before `npm test` and is byte-identical after it (`cmp` clean).

## Red before the fix (bug gate)

The regression tests were written first and run against the unchanged `src/`. The output below is `reports/.red-before-fix.txt`, copied verbatim (Prettier, which `npm run check` enforces on this file, emptied two whitespace-only lines inside the block; no text changed). The source file was then deleted. All 13 cases failed, and `tsc` also rejected the new `parseFlags` signature and the `lockError` field.

```text
# Red before fix — fix-scan-and-cortex-questions
# Branch fix/scan-and-cortex-questions, src/ unchanged (git status --short src: empty). 2026-10-07T14:30:07Z

$ npx tsc -p tsconfig.test.json && node scripts/prep-test-assets.mjs
test/unit/args.test.ts(29,5): error TS2554: Expected 1 arguments, but got 2.
test/unit/args.test.ts(33,52): error TS2554: Expected 1 arguments, but got 2.
test/unit/integrity.test.ts(55,20): error TS2339: Property 'lockError' does not exist on type 'IntegrityReport'.
tsc exit=2
prep-test-assets: package.json + assets for 3 module(s)

$ node --test --test-concurrency=1 --test-name-pattern='<the 7 regression test names>' dist-test/test/unit/integrity.test.js dist-test/test/integration/integrity.test.js dist-test/test/unit/args.test.js dist-test/test/integration/cortex-questions-cli.test.js
✖ cortex advance records each repeated --question as one open question (116.747209ms)
✖ doctor's fix hint for an unreadable lock is repair, not a bare laws lock (18.122542ms)
✖ laws scan --json exits 1 on an error-severity finding (112.556084ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (merge-conflict garbage) (53.358709ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (lockfileVersion 99) (52.765208ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (files is a string) (52.774458ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (files is an array) (51.948041ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (a files entry without a string digest) (52.113125ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (accepted is not an array) (51.209917ms)
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (symlinks is a string) (52.902416ms)
✖ verify keeps injection findings on an unreadable lockfile (49.444125ms)
✖ parseFlags collects a repeated repeatable flag into an array without splitting commas (1.076ms)
✖ an unreadable lockfile still reports scan findings (2.093625ms)
ℹ tests 13
ℹ suites 0
ℹ pass 0
ℹ fail 13
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 866.090208

✖ failing tests:

test at dist-test/test/integration/cortex-questions-cli.test.js:21:1
✖ cortex advance records each repeated --question as one open question (116.747209ms)
  AssertionError [ERR_ASSERTION]: cortex advance --change demo
  + actual - expected

    [
  +   'b',
  +   'c'
  -   'a',
  -   'b, c'
    ]

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/cortex-questions-cli.test.js:33:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'b', 'c' ],
    expected: [ 'a', 'b, c' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:49:1
✖ doctor's fix hint for an unreadable lock is repair, not a bare laws lock (18.122542ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /git checkout HEAD -- speclaw\.lock/. Input:

  'resolve the merge conflict in speclaw.lock or restore it from git (git checkout -- speclaw.lock); upgrade speclaw if the lockfileVersion is newer. Last resort: delete it and run speclaw laws lock — this re-baselines every pinned file and accepts any pending drift'

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:59:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'resolve the merge conflict in speclaw.lock or restore it from git (git checkout -- speclaw.lock); upgrade speclaw if the lockfileVersion is newer. Last resort: delete it and run speclaw laws lock — this re-baselines every pinned file and accepts any pending drift',
    expected: /git checkout HEAD -- speclaw\.lock/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:143:1
✖ laws scan --json exits 1 on an error-severity finding (112.556084ms)
  AssertionError [ERR_ASSERTION]: {
    "ok": false,
    "lockPresent": true,
    "rootMatches": true,
    "files": [],
    "symlinks": [],
    "findings": [
      {
        "detector": "injection/instruction-override",
        "severity": "error",
        "path": "AGENTS.md",
        "line": 1,
        "excerpt": "ignore previous instructions",
        "message": "Instruction-override phrasing in a rule file."
      }
    ],
    "verifyFindings": [
      {
        "lawId": "injection~instruction-override",
        "severity": "error",
        "engine": "integrity",
        "file": "AGENTS.md",
        "line": 1,
        "message": "Instruction-override phrasing in a rule file.",
        "detail": "ignore previous instructions"
      }
    ]
  }


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:154:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at node:internal/test_runner/test:1214:31
      at node:internal/process/task_queues:151:7
      at AsyncResource.runInAsyncScope (node:async_hooks:227:14)
      at AsyncResource.runMicrotask (node:internal/process/task_queues:148:8) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (merge-conflict garbage) (53.358709ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (lockfileVersion 99) (52.765208ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (files is a string) (52.774458ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (files is an array) (51.948041ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (a files entry without a string digest) (52.113125ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (accepted is not an array) (51.209917ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:222:5
✖ laws scan exits 1 and keeps findings on an unreadable lockfile (symlinks is a string) (52.902416ms)
  AssertionError [ERR_ASSERTION]:
  speclaw laws scan
    ✓ No injection findings.


  0 !== 1

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:231:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:253:1
✖ verify keeps injection findings on an unreadable lockfile (49.444125ms)
  AssertionError [ERR_ASSERTION]: integrity~lockfile~1
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:264:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at dist-test/test/unit/args.test.js:22:1
✖ parseFlags collects a repeated repeatable flag into an array without splitting commas (1.076ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

  + 'b, c'
  - [
  -   'a',
  -   'b, c'
  - ]

      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/args.test.js:24:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'b, c',
    expected: [ 'a', 'b, c' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/integrity.test.js:36:1
✖ an unreadable lockfile still reports scan findings (2.093625ms)
  AssertionError [ERR_ASSERTION]: both
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/integrity.test.js:43:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: /speclaw\.lock/,
    operator: 'match',
    diff: 'simple'
  }
exit=1
```

## Green after the fix

Same test files, after the fix (`/tmp/green.txt`, run by the tester on 2026-10-07):

```text
✔ cortex advance records each repeated --question as one open question (228.682959ms)
✔ speclaw laws lock and scan via CLI (109.912875ms)
✔ doctor's fix hint for an unreadable lock is repair, not a bare laws lock (16.912291ms)
✔ laws scan --json exits 1 on an error-severity finding (105.340417ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (merge-conflict garbage) (211.611584ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (lockfileVersion 99) (209.719833ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (files is a string) (206.668916ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (files is an array) (211.161708ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (a files entry without a string digest) (211.43475ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (accepted is not an array) (211.142958ms)
✔ laws scan exits 1 and keeps findings on an unreadable lockfile (symlinks is a string) (211.279291ms)
✔ verify keeps injection findings on an unreadable lockfile (48.584375ms)
✔ parseFlags reads --key value, --key=value, --bool, -x, and positionals (0.791166ms)
✔ parseFlags collects a repeated repeatable flag into an array without splitting commas (0.107417ms)
✔ a bare repeatable flag neither adds nor drops values, and repeated() never splits commas (0.495333ms)
✔ corrupt lockfile yields error finding (2.185666ms)
✔ an unreadable lockfile still reports scan findings (3.241458ms)
✔ missing lock with integrity-only skips scan (0.655875ms)
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

## Tests added / updated

| Test                                                                                                                                            | Asserts                                                                                                                                                                                                                                                                     | TDD evidence                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/unit/integrity.test.ts` · "an unreadable lockfile still reports scan findings"                                                            | Corrupt lock + `AGENTS.md` with `ignore previous instructions`; `verifyIntegrity` with `checks` `"both"` and `"scan"` returns `injection/instruction-override` in `findings`, a `lockError` matching `/speclaw\.lock/`, and `ok: false`                                     | Failed before (tsc: no `lockError`; then empty findings), passes after                                                                                                                     |
| `test/integration/integrity.test.ts` · "laws scan exits 1 and keeps findings on an unreadable lockfile (${label})" × 7 lock shapes              | Text and `--json` exit 1, name `speclaw.lock`, list the injection finding; JSON has `lockError`; clean `AGENTS.md` still exits 1; lock byte-identical                                                                                                                       | Failed before (exit 0, "No injection findings."), passes after                                                                                                                             |
| `test/integration/integrity.test.ts` · "laws scan --json exits 1 on an error-severity finding"                                                  | Valid lock, injected `AGENTS.md`: `--json` exits 1                                                                                                                                                                                                                          | Failed before (exit 0), passes after                                                                                                                                                       |
| `test/integration/integrity.test.ts` · "verify keeps injection findings on an unreadable lockfile"                                              | `speclaw verify --format json` exits non-zero; findings include `integrity~lockfile~1` and `injection~instruction-override`                                                                                                                                                 | Failed before (injection finding lost), passes after                                                                                                                                       |
| `test/integration/integrity.test.ts` · "doctor's fix hint for an unreadable lock is repair, not a bare laws lock" (extended)                    | Remedy matches `/git checkout HEAD -- speclaw\.lock/`                                                                                                                                                                                                                       | Failed before, passes after                                                                                                                                                                |
| `test/unit/args.test.ts` · "parseFlags collects a repeated repeatable flag into an array without splitting commas"                              | `--question a --question=b, c` gives `["a", "b, c"]`; single gives `["x"]`; non-repeatable `--path` stays last-wins; no `repeatable` arg keeps a string                                                                                                                     | Failed before (tsc arity; last-wins string), passes after                                                                                                                                  |
| `test/integration/cortex-questions-cli.test.ts` (new) · "cortex advance records each repeated --question as one open question"                  | `cortex advance` and `lawbook harness advance` both record `["a", "b, c"]`                                                                                                                                                                                                  | Failed before (`["b", "c"]`), passes after                                                                                                                                                 |
| `test/unit/args.test.ts` · "a bare repeatable flag neither adds nor drops values, and repeated() never splits commas" (**added by the tester**) | `REPEATABLE_FLAGS` is `["question"]`; `--question a --question` gives `["a"]`; `--question --question b` gives `["b"]`; a lone bare flag gives `true`; `repeated()` keeps arrays, wraps a string unsplit (`"b, c"` gives `["b, c"]`), and gives `[]` for `true`/`undefined` | Added after the fix to close the reviewer's note 4 and the in-process coverage gap on `repeated()` (`args.js` lines 56-61 were uncovered; now 100%). Not a regression test, so no red run. |

Must-stay-green tests, unedited and passing: "missing lock with integrity-only skips scan", "corrupt lockfile yields error finding", "speclaw laws lock and scan via CLI", "parseFlags reads --key value, --key=value, --bool, -x, and positionals".

## Spec-scenario coverage

Both delta specs are full copies of the canonical specs. Only `req~injection-scan~1` (law-enforcement) and `req~harness-state~1` (lawbook-workflow) change; every other scenario in those files is byte-identical to `lawbook/specs/` (`diff` shows only these two requirements) and stays covered by the existing suite (938/938 green). The scenarios of the two changed requirements:

| Requirement            | Scenario                                                | Verified by                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `req~injection-scan~1` | Instruction override detected                           | `test/unit/scan.test.ts` "instruction-override detector fires with path and line"; manual: `AGENTS.md:89` finding with severity error (cli.md M1)                                                                                                                                                    |
| `req~injection-scan~1` | Skill pack prose is scanned                             | `test/unit/scan.test.ts` "skill pack prose is scanned even when never invoked" (unchanged, green)                                                                                                                                                                                                    |
| `req~injection-scan~1` | Accept does not clear scan errors                       | `test/unit/integrity.test.ts` "accept updates digest; scan errors still fail" (unchanged, green)                                                                                                                                                                                                     |
| `req~injection-scan~1` | Scan runs and fails on an unreadable lock               | Integration "laws scan exits 1 and keeps findings on an unreadable lockfile" × 7 shapes; unit "an unreadable lockfile still reports scan findings"; manual M1–M3 (merge markers and `lockfileVersion` 99; text + `--json` exit 1; `lockError`; clean `AGENTS.md` still exits 1; `shasum -c` lock OK) |
| `req~injection-scan~1` | Scan JSON exit code matches the text output             | Integration "laws scan --json exits 1 on an error-severity finding" and "speclaw laws lock and scan via CLI"; manual M4 (valid lock clean: exit 0, no `lockError`; injected: exit 1)                                                                                                                 |
| `req~injection-scan~1` | Verify keeps scan findings on an unreadable lock        | Integration "verify keeps injection findings on an unreadable lockfile"; manual M2 (`verify --json` exit 1, `failed: 2`, both findings)                                                                                                                                                              |
| `req~harness-state~1`  | Illegal advance is rejected                             | `test/unit/harness.test.ts` "harness start/status/advance and rejects illegal jumps" (unchanged, green)                                                                                                                                                                                              |
| `req~harness-state~1`  | Start initializes exploring                             | Same test; manual M7 (`cortex start scratch` gives stage `exploring`, iteration 0)                                                                                                                                                                                                                   |
| `req~harness-state~1`  | Repeated --question flags each become one open question | Integration "cortex advance records each repeated --question as one open question"; unit args tests (2); manual M7–M8 (`["a","b, c"]` via `cortex advance` and via `lawbook harness advance`)                                                                                                        |

`req~laws-integrity-cli~1` and `req~doctor-integrity~1` are referenced by `// Covers:` tags but their spec text is unchanged; the doctor remedy is guarded by the extended doctor test and manual M9–M10.

## Pre-existing / unrelated failures

None. Notes, not failures:

- `src/cli/commands/laws.js` shows 57.93% line coverage in the in-process report because its scan branch runs only in spawned CLI processes (integration tests and manual runs), which `--experimental-test-coverage` does not count. The overall gate (80%) passes.
- `req~harness-state~1` uses the `<!-- id: … -->` form, which `speclaw coverage` does not index. This is how the canonical spec already declares it and is outside this change.

## Pending manual steps

None. The tester ran every manual step in temp directories (see `cli.md`).

## Verdict

PASS
