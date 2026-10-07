# Review: fix-scan-and-cortex-questions

**Role:** reviewer · **Change:** fix-scan-and-cortex-questions (bug, level 1, ships 2.0.12) · **Branch:** `fix/scan-and-cortex-questions` · **Date:** 2026-10-07

**Verdict: PASS**

I reviewed the uncommitted working tree against `bugfix.md`, `tasks.md`, both delta specs, and `reports/.red-before-fix.txt`. Gates and manual verification belong to the tester (tasks 9 to 11) and were not run here. The reviewer role has no shell.

## Findings

### RC1: scan no longer depends on the lock (`src/modules/foundation/integrity.ts`, `verifyIntegrity`)
- When `readLockfile` throws, the function still runs `scanAll` if `checks` is `"scan"` or `"both"`. It returns `ok: false` and keeps the `integrity~lockfile~1` error. It also appends the scan error and warn findings to `verifyFindings` and sets `lockError`. The scan really is independent of the lock: `scanAll` only uses `discoverIntegrityPaths`.
- `checks: "integrity"` with an unreadable lock gives `findings: []` and `ok: false`. This matches the old behavior.
- Missing lock: the `!lock && doIntegrity` path is unchanged and stays soft. `checks: "scan"` with no lock goes to the common tail with no `lockError`. There is no regression.
- `IntegrityReport.lockError?: string` is optional and has a doc comment, so the change is additive. The only callers are `laws.ts:95` and `verify.ts:57`. No MCP tool calls it.

### RC2: `laws scan` exit rule (`src/cli/commands/laws.ts`, `scan` branch)
- One `failed` predicate (`lockError !== undefined || any finding with severity error`) drives both text mode and `--json`. Results:
  - Valid lock, clean files: exit 0.
  - Valid lock, warnings only: exit 0.
  - Missing lock with an error finding: exit 1.
  - Unreadable lock: always exit 1, even with a clean `AGENTS.md`.
- Text mode prints the lock error before the findings. `No injection findings.` only appears when there are no findings and no lock error. This matches the spec.
- `speclaw verify` (`verify.ts`) needs no change. `foldIntegrityIntoReport` counts the lockfile error and the scan errors in `summary.failed`, so the run exits non-zero and the report names both.

### RC3: repeatable `--question` (`src/cli/lib/args.ts`, `src/cli/index.ts`, `cortex.ts`, `lawbook.ts`)
- `parseFlags(argv, repeatable = [])`: other callers get the old last-wins behavior. `index.ts` passes `REPEATABLE_FLAGS = ["question"]`, and only `cortex.ts:48` and `lawbook.ts:210` read `flags.question`, so no other flag changes.
- Cases checked:
  - `--k v` and `--k=v` both append in argv order.
  - A single value becomes `["x"]`.
  - A bare repeatable flag on its own gives `true`, and `repeated()` turns that into `[]`.
  - A bare flag after values is a no-op.
  - A value after a bare flag replaces `true` with `[value]`.
- `list()` is unchanged. `repeated()` does not split on commas. The absent case still gives `[]`, which is what `list()` gave before. `harness.ts` is untouched, so the MCP `cortex` tool (`openQuestions` array) is unaffected.
- Help text (`help.ts:348`) now says one flag is one question and commas are kept.

### RC4: doctor remedy (`src/modules/foundation/doctor.ts`, `UNREADABLE_LOCK_REMEDY`)
- Only `git checkout HEAD -- speclaw.lock` changed. The rest of the remedy text is unchanged, and the extended doctor test checks it.

### Tests, Covers tags, spec text
- All seven regression tests from bugfix §6 exist. Each has a `// Covers:` tag and names a real requirement ID (`req~injection-scan~1`, `req~harness-state~1`, `req~laws-integrity-cli~1`, `req~doctor-integrity~1`).
- The red evidence shows 13/13 failing on the unchanged `src/`. The failures are the expected assertion messages, plus tsc errors for the new signature and field.
- The tests bugfix §6 says must stay green are unedited: "missing lock with integrity-only skips scan", "corrupt lockfile yields error finding", "speclaw laws lock and scan via CLI", and the single-`--path` args case.
- `req~injection-scan~1` and `req~harness-state~1` match the implementation word for word on exit codes, `lockError`, and the unsplit argv order. No canonical spec text conflicts: `req~laws-integrity-cli~1` says nothing about scan exit codes.
- The README at line 313 documents the new exit rule.

## Non-blocking notes
1. `bugfix.md` §3 and `tasks.md` give the old paths `src/cli/args.ts` and `src/cli/help.ts`. The real paths are under `src/cli/lib/`. This affects only the documentation.
2. `bugfix.md` §5.4 says the two commands pass `["question"]` themselves. The code passes it once, globally, in `index.ts`. Both behave the same, because no other command reads `question`.
3. `--question=a=b` loses `=b`, because `split("=", 2)` truncates. This bug existed before this change and also affects every other flag. It is out of scope here.
4. The unit test covers `--k v` and `--k=v` mixed. The bare-flag mixes rely on the code reading above and have no assertion. Adding one is optional.
5. In the lock-error report, `guidance` duplicates `lockError`. This is harmless.

## Remaining for the tester / coordinator
Tasks 9 to 14 are still open: gates, manual verification in temp directories, the `backend.md` and `cli.md` reports, the CHANGELOG lines, sync, and archive.

Compass calls made: 0 (the session MCP server is stale; per the coordinator, files were read directly).
