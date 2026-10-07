# CLI checks — fix-compass-query-output (2026-10-07)

**Discipline:** cli (`speclaw explore`, `speclaw cortex advance
--pause-questions`, `speclaw lawbook draft --bug`, `speclaw search|recall`) ·
**Change:** fix-compass-query-output (bug, level 3) · **Date:** 2026-10-07 ·
**Branch:** fix/compass-query-output (uncommitted vs `main`) · **cwd:** gates in
`/Users/esneiderbravo/Projects/speclaw`; the built CLI
(`node /Users/esneiderbravo/Projects/speclaw/dist/cli/index.js`) ran inside
`mkdtemp` fixtures under `/tmp`. The 2.0.12 baseline is the installed
`/usr/local/bin/speclaw` (`--version` 2.0.12).

## Gates & results

| Check | Command | Result |
|---|---|---|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ exit 0. **984/984 pass, 0 fail, 0 skipped** (the e2e/CLI-spawning tests ran: `skipped 0`). Coverage over all files: 88.35 / 85.74 / 90.57. |
| Change validation | `node dist/cli/index.js lawbook validate fix-compass-query-output` | ✅ exit 0 |
| Coverage | `node dist/cli/index.js coverage --change fix-compass-query-output --json` (isolated copy) | ✅ 29/29 deep-covered, 0 defects |
| `verify` | `node dist/cli/index.js verify` (isolated copy) | ⚠️ exit 1. 12 `drift~changed-semantic`, including the `cli` anchor `never-contaminate-machine-consumed-output` on `explore` (see below), plus the expected `docs/compass.md` advisory |

## Tests added / updated — red before the fix, green after

| Test | Asserts | Red before fix (`.red-before-fix.txt`) | Green |
|---|---|---|---|
| `advance --pause-questions from implementing exits non-zero` (`test/integration/cortex-questions-cli.test.ts`) | the built CLI exits non-zero; `harness.json` unchanged | `cortex advance --change demo: { … actual: 0, expected: 0` (the CLI exited 0 and silently advanced) | ✅ |
| `cortex advance records each repeated --question as one open question` (guard, unchanged) | the planning pause still works | stayed green | ✅ |
| `bug draft without a level is not self-confirmed` (`test/unit/bugfix.test.ts`) | backs the `draft --bug` message | `change.json carries confirmedLevel … actual: true, expected: false` | ✅ |

## Manual verification

| Command (fixture) | Observed |
|---|---|
| `explore src/types.ts` (`fcq-fixture.*`) | `Callers` → `render (src/view.ts:3) via ref`, `Widget (src/view.ts:7) via ref` |
| `explore render` | `Callers` → `main (src/main.ts:4) via call` |
| `explore Props` | resolves to the `src/other.ts` `Props` (pre-existing first-match choice among same-named symbols) with `otherUse … via ref`. The file form `explore src/types.ts` selects the other one. |
| `lawbook draft --bug dup-charge`, no `--level` (`fcq-lawbook.*`) | exit 0, `✓ bug change "dup-charge" scaffolded at … (level unconfirmed — run \`speclaw lawbook level set\`)`. `change.json` has `level: null`, `degraded: ["no-targets","no-index"]`, and no `confirmed*`. `bugfix.md` header reads `**Level:** unconfirmed`. Files: `bugfix.md`, `change.json`, `reports/`, `tasks.md`. |
| `lawbook validate dup-charge` | `missing design.md (required at ceremony level 3)` |
| `cortex start` then `cortex advance --pause-questions --question q1` (stage `exploring`) | `✗ pauseForQuestions is only valid from stage planning (current: exploring)`; `harness.json` byte-identical (`cmp`) |
| `cortex advance` ×2 | `exploring → planning → implementing` (unconfirmed treated as level 3; `harness.json` `level: 3`) |
| `cortex advance --change dup-charge --pause-questions --question q1` (stage `implementing`) | **exit 1**, `✗ pauseForQuestions is only valid from stage planning (current: implementing)`; `harness.json` byte-identical; `openQuestions: []` |
| `search "functionHandler1"` and `--json`: 2.0.12 on `/tmp/fcq-old.*` vs branch on a byte copy `/tmp/fcq-old2.*` | text output **identical** (`diff` empty). JSON top keys `budget,degraded,focus,hits,rendered,route,tokens` and hit keys `file,kind,line,name,nodeId,signals,signature` are the same; focus, budget (4000), and hit order are equal |
| `recall "multiply value" --json`: 2.0.12 vs branch | same top keys and hit keys |

Note: `speclaw explore` has no `--json` output on either version (the flag is
ignored), so `via` reaches the CLI as text tags only.

## Spec-scenario coverage — CLI scenarios

| Spec | Requirement | Scenario | Verified by |
|---|---|---|---|
| context-budget | `req~find-response-budget~1` | The CLI search output is unchanged | manual `search`/`recall` vs 2.0.12 (text identical, JSON keys identical) ✅ |
| lawbook-workflow | `req~harness-pause-questions~1` | The CLI exits non-zero on a misplaced pause | `cortex-questions-cli.test.ts` ✅; manual exit 1 + byte-identical ✅ |
| lawbook-workflow | `req~bug-draft-unconfirmed~1` | A bug draft without a level is unconfirmed (CLI path) | `bugfix.test.ts` ✅; manual `draft --bug` ✅ |
| lawbook-workflow | `req~harness-level-current~1` | An unconfirmed level never skips planning (CLI path) | `harness.test.ts` ✅; manual `exploring → planning` ✅ |
| code-graph | `req~type-ref-edges~1` | An interface lists its users as ref callers (CLI twin) | manual `explore src/types.ts` `via ref` ✅ |

The other scenarios are in `api.md`, `backend.md`, and `database.md`. The
unchanged ones are in the `backend.md` appendix.

## Pre-existing / unrelated failures

- The `cli` drift anchor `never-contaminate-machine-consumed-output` (`explore`)
  reports `changed-semantic` because `explore` gained `includeRefs`. Machine
  output is unaffected: `search --json` is unchanged (above), and the
  `explore` text tags go to stdout only in the human view. This anchor is not
  in the change's capabilities, so archive will not reseal it.
- None among the tests.

## Pending manual steps

None for verification. For the archiver: reseal the `cli` and
`law-enforcement` anchors after archive (`speclaw drift --reseal`).

## Verdict

**PASS**: all CLI behaviours are as specified; the overall change verdict is PASS after Rework 2.

### Rework 2 (T1, T2) — re-test

- T1: the worktree-focus scenario and bugfix.md now say *tracked, modified*
  `notes.md`, and the scenario adds "untracked files SHALL NOT be part of the
  worktree focus" (git diff HEAD skips untracked files).
- T2: `budgetExploreShape` sizes full-mode source to 400 lines and its full-mode
  hints no longer point at `mode:"full"`. Regression test
  `test/unit/output-budget.test.ts::budgetExploreShape keeps a 172-line source
  whole in full mode…` failed first (`ℹ pass 6 / ℹ fail 1`) and passes after
  the fix; output in `.red-before-fix.txt` under "rework 2 / T2". Manual:
  `compass_explore handleHarness mode:"full"` returns 172/172 source lines with
  no truncation entry.
- Gates: `npm run check && npm test` exit 0 — 985 tests, 985 pass, 0 fail;
  coverage 88.39% lines / 85.74% branches / 90.57% functions (68 s).
