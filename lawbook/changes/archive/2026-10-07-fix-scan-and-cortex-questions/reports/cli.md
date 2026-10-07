# CLI checks — fix-scan-and-cortex-questions (2026-10-07)

Date 2026-10-07 · Branch `fix/scan-and-cortex-questions` · Environment: macOS (darwin), Node v24.17.0, built CLI `node /Users/esneiderbravo/Projects/speclaw/dist/cli/index.js`, cwd a throwaway project under `mktemp -d /tmp/speclaw-man.XXXX` (`$M/p`) with `HOME=$M/home`.

Discipline: CLI contract (output shape, streams, exit codes, flag semantics) for `speclaw laws scan`, `speclaw verify`, `speclaw cortex advance` / `speclaw lawbook harness`, and `speclaw doctor`. Unit and gate evidence is in `backend.md`.

## Why no `api.md`

No HTTP endpoint exists, and no MCP tool's input schema or result changes. `verifyIntegrity` has no MCP caller (`law_verify` runs `verifyLaws`, not integrity). The `cortex` MCP tool already takes `openQuestions` as an array and goes through the unchanged `harness.ts`. The governed contract is CLI output and exit codes, documented here with the same rigor as an `api.md`.

## Contract

### `speclaw laws scan` (checks `"scan"`)

| Condition                                                                                        | Text mode                                           | `--json`                                            | Exit                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| Lock readable or missing, no findings                                                            | stdout `✓ No injection findings.`                   | report, no `lockError`                              | 0                                |
| Lock readable or missing, warn-only findings                                                     | stdout `! <detector> — <path>:<line> <message>`     | report, no `lockError`                              | 0                                |
| Lock readable or missing, any `error` finding                                                    | stderr `✗ <detector> — <path>:<line> <message>`     | report, no `lockError`                              | 1 (was 0 for `--json`)           |
| Lock exists but unreadable (merge markers, `lockfileVersion` > 1, wrong structure), any findings | stderr `✗ speclaw.lock: …` first, then each finding | report with `lockError`, `ok: false`, findings kept | 1 (was 0, findings were dropped) |

`--json` writes only the report to stdout (stderr empty). Report shape (`IntegrityReport`):

```json
{
  "ok": false,
  "lockPresent": true,
  "rootMatches": false,
  "guidance": "speclaw.lock: unreadable (…)",
  "files": [],
  "symlinks": [],
  "findings": [
    {
      "detector": "injection/instruction-override",
      "severity": "error",
      "path": "AGENTS.md",
      "line": 89,
      "excerpt": "ignore previous instructions",
      "message": "Instruction-override phrasing in a rule file."
    }
  ],
  "verifyFindings": [
    {
      "lawId": "integrity~lockfile~1",
      "severity": "error",
      "engine": "integrity",
      "file": "speclaw.lock",
      "message": "…"
    },
    {
      "lawId": "injection~instruction-override",
      "severity": "error",
      "engine": "integrity",
      "file": "AGENTS.md",
      "line": 89,
      "message": "…",
      "detail": "ignore previous instructions"
    }
  ],
  "lockError": "speclaw.lock: unreadable (…)"
}
```

`lockError` is additive and optional: present only when `speclaw.lock` exists and cannot be read. Existing fields keep their meaning. Exit rule (text and `--json`): `1` if `lockError` is set or any finding has severity `error`, otherwise `0`. The scan never writes `speclaw.lock`.

### `speclaw verify`

With an unreadable lock, the report keeps the `integrity~lockfile~1` finding and now also folds every scan finding (`injection~<name>` law ids). Any of them at `error` makes the run exit 1. Before the fix the scan findings were lost.

### `speclaw cortex advance` / `speclaw lawbook harness advance` (deprecated alias)

`--question <text>` is repeatable. Each occurrence (`--question v` or `--question=v`) is exactly one open question, in argv order, never split. **Behavior change:** a single `--question 'b, c'` now records one question `"b, c"`; before, it was split into `["b", "c"]`, and repeated flags kept only the last. A bare `--question` with no value adds nothing. Every other flag stays last-wins, and comma-list flags (`list()`) are unchanged. Help text: `--question <text>    One open question, commas included; repeat for more`. Exit codes are unchanged (0 on success).

### `speclaw doctor` (`cfg.integrity.lock`)

Remedy now reads `… restore it from git (git checkout HEAD -- speclaw.lock); …`. The rest of the text is unchanged. Doctor exits 1 on this error, as before.

## Gates & results

| Check                                                     | Command                                     | Result                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint + format                                             | `npm run check`                             | ✅ exit 0                                                                                                                                                      |
| Build                                                     | `npm run build`                             | ✅ exit 0                                                                                                                                                      |
| Tests                                                     | `npm test`                                  | ✅ exit 0 — `tests 938`, `pass 938`, `fail 0`                                                                                                                  |
| CLI integration tests (spawn the built CLI in temp repos) | targeted `node --test …` (see `backend.md`) | ✅ 18/18, including 7 unreadable-lock shapes × text/`--json`, `--json` error-finding exit, verify fold, doctor remedy, repeated `--question` via both commands |
| Manual M1–M10                                             | below                                       | ✅ all as expected                                                                                                                                             |

## Manual verification (tester-executed)

Setup: `mktemp -d`, `HOME=$M/home`, `git init`, `node $CLI init --yes --agents claude --no-index` (exit 0), commit as baseline. `laws scan` on the fresh project: `✓ No injection findings.`, exit 0.

| #   | Step                                                                                                                                                                                                                   | Observed                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Append `ignore previous instructions` to `AGENTS.md`; write `<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n` to `speclaw.lock`; `laws scan`                                                                           | stderr `✗ speclaw.lock: unreadable (Unexpected token '<', "<<<<<<< HE"... is not valid JSON)` then `✗ injection/instruction-override — AGENTS.md:89 …`; stdout only the heading; **exit 1**                                                                                                                                                                                                 |
| M1  | `laws scan --json`                                                                                                                                                                                                     | JSON above (findings + `verifyFindings` + `lockError`), stderr empty, **exit 1**; `shasum -c` on the lock: `speclaw.lock: OK` (byte-identical)                                                                                                                                                                                                                                              |
| M2  | `verify --json` on the same fixture                                                                                                                                                                                    | **exit 1**; `summary {"evaluated":0,"passed":0,"failed":2,…}`; lawIds `integrity~lockfile~1` and `injection~instruction-override`. Text `verify`: `0 passed · 2 failed`, lists both, exit 1                                                                                                                                                                                                 |
| M3  | Restore clean `AGENTS.md`, lock still corrupt; `laws scan` / `--json`                                                                                                                                                  | lock error only, **exit 1** both; JSON has `lockError`; lock `OK`                                                                                                                                                                                                                                                                                                                           |
| M3b | Valid lock with `lockfileVersion` 99 + injected `AGENTS.md`                                                                                                                                                            | `✗ speclaw.lock: unsupported lockfileVersion 99 (max 1)` + injection finding, exit 1; `--json` `lockError` set, exit 1; lock `OK`                                                                                                                                                                                                                                                           |
| M4  | Valid lock, clean `AGENTS.md`, `laws scan --json`                                                                                                                                                                      | **exit 0**, `findings 0`, no `lockError` key                                                                                                                                                                                                                                                                                                                                                |
| M5  | Valid lock, `AGENTS.md` with `See @~/notes.md` (warn only)                                                                                                                                                             | text `! injection/external-import — AGENTS.md:89 …` exit 0; `--json` `injection/external-import:warn`, no `lockError`, **exit 0**                                                                                                                                                                                                                                                           |
| M5b | Same plus `ignore previous instructions`                                                                                                                                                                               | `--json` **exit 1**, text **exit 1**                                                                                                                                                                                                                                                                                                                                                        |
| M6  | Lock missing (moved aside): clean / injected                                                                                                                                                                           | clean: `✓ No injection findings.` exit 0, JSON `ok:true, lockPresent:false`, no `lockError`, exit 0. Injected: text exit 1, `--json` exit 1. No lock was created.                                                                                                                                                                                                                           |
| M7  | `lawbook draft scratch --level 1`, `cortex start scratch` (stage `exploring`), `cortex advance scratch` (stage `planning`), then `cortex advance scratch --pause-questions --question "a" --question "b, c"`           | exit 0; `harness.json` stage `questions`, `openQuestions ["a","b, c"]`                                                                                                                                                                                                                                                                                                                      |
| M7b | Resume, then `cortex advance scratch --pause-questions "--question=x, y"`                                                                                                                                              | `openQuestions ["x, y"]` (one question, the comma kept)                                                                                                                                                                                                                                                                                                                                     |
| M8  | Resume to `planning`, then `lawbook harness advance --change scratch --pause-questions --question "a" --question "b, c"`                                                                                               | exit 0; `openQuestions ["a","b, c"]`                                                                                                                                                                                                                                                                                                                                                        |
| M9  | Merge markers in `speclaw.lock`; `doctor`                                                                                                                                                                              | exit 1; `✗ rule lockfile speclaw.lock: unreadable (…)` with `→ … restore it from git (git checkout HEAD -- speclaw.lock); …`                                                                                                                                                                                                                                                                |
| M10 | Real conflict in the temp repo: branch `other` and `main` each change the `AGENTS.md` digest in `speclaw.lock`; `git merge other` gives `CONFLICT (content): Merge conflict in speclaw.lock`, status `UU speclaw.lock` | `doctor` prints the `git checkout HEAD -- speclaw.lock` remedy; `laws scan` exit 1 with the lock error. Old advice `git checkout -- speclaw.lock`: `error: path 'speclaw.lock' is unmerged`, exit 1. New advice `git checkout HEAD -- speclaw.lock`: exit 0, worktree blob `e51c440…` equals `HEAD:speclaw.lock`, no markers left; `laws scan` then exit 0. `git merge --abort` afterwards. |

## Isolation

Every manual run used a fresh `mktemp -d` project with `HOME` redirected inside it. Nothing ran against this repo's `speclaw.lock`, `harness.json`, or `lawbook/`. No `init` or `update` ran in this repo. The integration tests use the suite's temp-repo helpers. No real data store is involved.

## Tests added / updated

See `backend.md`. CLI-level: `test/integration/integrity.test.ts` (unreadable-lock loop × 7, `--json` error exit, verify fold, doctor remedy assert) and the new `test/integration/cortex-questions-cli.test.ts` (both commands).

## Spec-scenario coverage

| Scenario                                                                                                                 | CLI evidence                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `req~injection-scan~1` · Scan runs and fails on an unreadable lock                                                       | M1, M3, M3b; integration loop × 7                                                       |
| `req~injection-scan~1` · Scan JSON exit code matches the text output                                                     | M4, M5, M5b; "laws scan --json exits 1 on an error-severity finding"                    |
| `req~injection-scan~1` · Verify keeps scan findings on an unreadable lock                                                | M2; "verify keeps injection findings on an unreadable lockfile"                         |
| `req~injection-scan~1` · Instruction override detected / Skill pack prose is scanned / Accept does not clear scan errors | Unchanged; unit tests in `backend.md`; M1 shows the override finding with path and line |
| `req~harness-state~1` · Repeated --question flags each become one open question                                          | M7, M7b, M8; `cortex-questions-cli.test.ts`                                             |
| `req~harness-state~1` · Illegal advance is rejected / Start initializes exploring                                        | Unchanged; `test/unit/harness.test.ts`; M7 start shows `exploring`, iteration 0         |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

PASS
