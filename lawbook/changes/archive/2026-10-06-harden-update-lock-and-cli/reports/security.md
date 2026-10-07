# Security checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · gates in cwd `/Users/esneiderbravo/Projects/speclaw`; manual runs in the throwaway repo `/tmp/speclaw-mv.IlR3ps/p1` (a `git init` + `speclaw init` scratch project) with the built CLI, `HOME=/tmp/speclaw-mv.IlR3ps/home`, and the local registry stub preload (see `cli.md`). This repo's own `speclaw.lock`, `CLAUDE.md`, and `AGENTS.md` were only read: sha256 before = after (`63d45909…`, `edfca9c6…`, `3c8610ca…`), and `git status` is clean for all three.

Scope: lock refresh no longer launders drift (`req~lock-preserves-drift~1`, `req~lock-refresh-update~1`); the TTY-only, confirmed re-baseline with a post-confirmation re-check (`req~laws-accept-human~1`, `req~laws-integrity-cli~1`); refusal to rebuild an unreadable or structurally invalid lock; `accepted[]` pruning; and the safe-argv self-update spawn (`req~update-self-update~1`, D12).

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0, Prettier clean, ESLint clean |
| Type-check + build | `npm run build` | ✅ exit 0 |
| Full suite + coverage | `npm test` | ✅ tests 833, pass 833, fail 0, skipped 0; all files 86.32 / 82.68 / 88.22 (floor 80) |
| Security-touched tests | `node --test --test-concurrency=1 dist-test/test/unit/lock.test.js dist-test/test/integration/integrity.test.js dist-test/test/unit/integrity.test.js dist-test/test/unit/self-update.test.js` | ✅ tests 93, pass 93, fail 0 |
| Coverage of touched modules | from `npm test` | `foundation/lock.js` 99.21 / 91.95 / 100; `foundation/integrity.js` 99.38 / 93.41 / 76.92; `foundation/compile-laws.js` 96.93 / 82.09 / 93.75; `foundation/scaffold.js` 94.98 / 86.96 / 100; `cli/lib/self-update.js` 98.15 / 82.76 / 100; `foundation/doctor.js` 69.48 / 63.89 / 78.26 (its CLI paths run in spawned children). `cli/commands/laws.js` reads 59.38% because most of its paths run in spawned CLI children, which the collector does not see; the `runLaws` seam tests and the integration CLI tests exercise them |
| Requirement coverage | `lawbook_change` `coverage`, change-scoped, `onlyDefects` | ✅ 0 defects; `req~lock-preserves-drift~1` utest+itest+impl (22 links), `req~laws-accept-human~1` utest+itest+impl (11), `req~lock-refresh-update~1` utest+itest+impl (6), `req~update-self-update~1` utest+impl (18) |
| Lock integrity of this repo | `node dist/cli/index.js verify --json` (read-only) | ✅ **zero `integrity~*` findings**: the real `speclaw.lock` parses, passes `lockShapeError`, and every strict digest matches. `verify` still **exits 1**, because of 11 `drift~changed-semantic` findings (sealed spec anchors). That is not lock integrity; see "Pre-existing / unrelated failures" |
| Integrity verbs | `node dist/cli/index.js laws verify` | ✅ exit 0, "No violations." (dependency/graph laws only; the digest check runs in `verify`) |

## Tests added / updated

- `test/unit/lock.test.ts`: `driftedStrictPaths`; preserve + `preserved`; `accepted[]` digest is not drift; clean strict refreshed after a compile rewrite; new strict added; advisory refreshed; stale/superseded `accepted[]` pruned; `rebaseline` records acceptance; `laws lock --force` confirmed / declined-or-cancelled / nothing drifted / unreadable (both modes); two prompt races (the listed file changes again, or an unlisted strict file drifts) → `LockChangedError`, exit 1, bytes identical; direct `refreshLockfile` stale-digest cases; a lock without optional fields still reads; `laws accept` on an unreadable lock prints a clean error; an `UNREADABLE_LOCKS` table (garbage, v99, `files` string, `files` array, entry without digest, `accepted` object, `symlinks` string) × {`refreshLockfile`, `compileLaws`}.
- `test/integration/integrity.test.ts`: update-path scaffold keeps a drifted `CLAUDE.md` (verify `ok:false`, `modified`); the report names the preserved file while a clean `AGENTS.md` stays verified; `laws lock --force` without a TTY exits 1 with the bytes unchanged; `laws lock` warns with the accept command; `UNREADABLE_LOCKS` × {update-path scaffold, `laws lock`, `laws lock --force`, `laws compile`}.
- `test/unit/self-update.test.ts` / `test/unit/update.test.ts`: `safeForwardArgs` drops `;`, `&`, `|`, spaces, and `$()`; `isSafeVersion` rejects `9.9.9 & calc`, `9.9.9;id`, `$(id)`, and `v2.0.8`; an unsafe version never reaches the spawn.
- Rework 3: `test/unit/lock.test.ts` "laws accept on a scan-only path reports that error plainly, not lock-repair advice" (exit 1, bytes unchanged, names the scan-only path, no delete / `laws lock` / left-unchanged advice); `test/integration/integrity.test.ts` "doctor's fix hint for an unreadable lock is repair, not a bare laws lock".
- **TDD:** item 2 failed 2/2 before the `lock.ts` fix (`.red-2.txt`); rework B1 failed 8/8 (`.red-b1.txt`); rework 2 failed 23/60, with all 20 structural rows, both prompt races, and the accept crash red (`.red-r2.txt`). Rework 3 N-a failed 1/1 (`.red-na.txt`). All four are folded verbatim below.

## Manual verification (tester-executed, isolated)

| # | What | Observed |
|---|------|----------|
| M4 | `init` → commit → append to `CLAUDE.md` → `update --no-self-update` | `! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md`; `shasum -a 256 -c` on `speclaw.lock` → OK (byte-identical) |
| M5 | `verify` after M4 | exit 1: `! integrity~digest-mismatch~1 — CLAUDE.md expected sha256:02f11aae… found sha256:5fcaf36c…` (the tamper is not laundered) |
| M6 | `laws lock` (no `--force`) | `✓ Wrote speclaw.lock …` + `! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md`; sha256 identical; `verify` still fails on `CLAUDE.md` |
| M7 | `laws lock --force </dev/null` | exit 1, `requires an interactive TTY — re-baselining is human-only.`, sha256 identical |
| M8 | `laws lock --force` on a real pty (`script`), answer `n` | listed `CLAUDE.md`, `expected sha256:02f11aae…`, `actual sha256:5fcaf36c…`; `! Re-baseline cancelled — lockfile unchanged.`; exit 1; sha256 identical |
| M9 | same, answer `y`, `--note "tester manual"` | exit 0; `CLAUDE.md` digest → `sha256:5fcaf36c…`; `accepted[]` holds `{path: "CLAUDE.md", digest: "sha256:5fcaf36c…", at, by: "esneiderbravo", note: "laws lock --force: tester manual"}`; `verify` exit 0 |
| M10 | bad lock × writer matrix | 8 bodies: merge-conflict garbage, `lockfileVersion: 99`, `files: "x"`, `files: []`, `files.CLAUDE.md` without digest, `accepted: {}`, `symlinks: "x"`, and a valid lock made unreadable with `chmod 000` (EACCES). Each × {`init`, `update --no-self-update`, `laws compile`, `laws lock`} → **32/32 exit 1, 32/32 lock bytes identical**. Messages: `✗ speclaw.lock: unreadable (…)` / `unsupported lockfileVersion 99 (max 1)` / `invalid structure (files is not an object \| files["CLAUDE.md"] has no string digest \| accepted is not an array \| symlinks is not an object)`, then `— speclaw.lock was left unchanged; repair it and re-run` |
| M11 | bad lock × readers / human paths | garbage, v99, `files:"x"`: `verify` → exit 1 with `! integrity~lockfile~1 — speclaw.lock` and the reason; `doctor` → exit 1 with `✗ rule lockfile speclaw.lock: <reason>`; `laws accept CLAUDE.md` on a pty → exit 1 with one `✗ speclaw.lock: … was left unchanged. Repair it (resolve merge markers, or upgrade speclaw …); to start over, delete it and run speclaw laws lock.` line and **no stack trace**; `laws lock --force` on a pty with `y` → exit 1, the same message. Bytes identical in every case |
| M12 | Nit N-a (below) | reproduced |
| M13 | Safe-argv spawn | `update --backup --minimal 'bad;rm -rf /'` with a fake `npx`: warning `Not forwarding unsafe argument(s): bad;rm -rf /`; recorded child argv = `-y @esneiderbravo/speclaw@99.0.0 update --backup --minimal` (the token never reached the child). `STUB_LATEST="99.0.0 & calc"` → no spawn, `invalid version`, in-process migration. Loop guard `SPECLAW_SELF_UPDATED=99.0.0` set in the child env; the parent with that env does not spawn |

### Reviewer nit N-a — verified, user-facing wording defect (low, non-blocking)

**Status: fixed in rework 3 (R3.1/R3.2) and re-verified; see "Rework 3 re-test" (RT3-1). The text below records the previous run.**

Repro in `p1/` with a **valid** lock (bytes unchanged throughout):

```
$ printf 'scan-only rule\n' > .cursorrules
$ script -q na2.ts node $CLI laws accept .cursorrules --note x   # pty, answered y
EXIT=1
  .cursorrules
  actual   sha256:e22db6d4bd6056e29b0f9786f1bd7690b88939678567e3c5cf0fe825f36314fe
  ✗ .cursorrules is scan-only — digests are not locked for this path. — speclaw.lock was left unchanged. Repair it (resolve merge markers, or upgrade speclaw for a newer lockfileVersion); to start over, delete it and run `speclaw laws lock`.
```

- Confirmed for the scan-only case. `runAccept` (`src/cli/commands/laws.ts`, the `catch` around `acceptLockPath`) wraps every error in `lockUnreadableMessage`.
- **Not** reproduced for "File not found": `runAccept` checks `fs.existsSync` before `acceptLockPath` and prints a plain `✗ File not found: does-not-exist.md` (exit 1).
- **Is it user-facing? Yes.** The behavior is correct (exit 1, nothing written), but the advice is wrong for a healthy lock. If a user followed "delete it and run `speclaw laws lock`", a fresh lock would baseline every strict file from disk. That would re-baseline any outstanding drift without the human `accept`/`--force` gate, which is the laundering this change closes (the user would have to delete the lock first, and git shows that). No spec scenario covers the wording, so it is not a conformance failure. Suggested fix (product code, not the tester's): apply `lockUnreadableMessage` only when the message starts with `speclaw.lock:`, and print other errors as-is. Recommend fixing it in a quick rework before archive, or recording it as a follow-up next to R3.

### Lock-engine behavior confirmed by reading the code with tests (not hand-reproducible)

- **TOCTOU re-check (rework R1):** `refreshLockfile` re-reads the lock, recomputes the drift, and compares it with the `confirmed` set before writing; any difference throws `LockChangedError`. A hand repro needs a concurrent writer during the prompt, so it was not run by hand. The `lawsConfirm` seam test mutates `CLAUDE.md` / `AGENTS.md` inside the prompt callback, and both cases give exit 1, identical bytes, and "changed while the confirmation was open" (red in `.red-r2.txt`). Residual N-b (an unlisted file edited and reverted between the snapshot and the recompute) stays theoretical, as the reviewer noted.
- **Accepted pruning:** `lock.test.ts` "stale and superseded accepted[] entries are pruned". In M9 the new `accepted[]` entry survives because its digest equals the locked one.

## Spec-scenario coverage

Every `#### Scenario` of the `law-enforcement` delta (114) is listed below. The delta is a full copy; "Unchanged carry-over" rows are canonical scenarios this change did not edit.

| # | Scenario | Requirement | How verified |
|---|----------|-------------|--------------|
| LAW-1 | The manifest is seeded on init from the target repo | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-2 | Cycle-law scope follows detected source roots | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-3 | Speclaw-shaped repos still receive dogfood laws | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-4 | A curated manifest is preserved on update | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-5 | Missing manifest falls back to the adapted seed | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-6 | Seed architecture deps laws consider import edges only | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-7 | A law with an unimplemented backend is declared but inert | `req~adapt-seed-to-repo~1` | Unchanged carry-over; tagged tests `unit/laws.test.ts` green in `npm test` (833/833) |
| LAW-8 | Hooks generated for a hook-capable agent | Hook generation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-9 | The Compass nudge entry is installed without laws | Hook generation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-10 | Update rewrites hooks that lacked input | Hook generation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-11 | Agent without hook support | Hook generation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-12 | Pre-existing user hooks are preserved | Idempotent hook merge | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-13 | A user SessionStart command hook is preserved | Idempotent hook merge | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-14 | Re-running produces no drift | Idempotent hook merge | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-15 | The session-start entry is installed without laws | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-16 | The command does nothing without an index | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-17 | The local binary is preferred | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-18 | An older speclaw on PATH does nothing | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-19 | The npx fallback runs offline | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-20 | A failing refresh never fails the session | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-21 | Agents without hook support get no session-start entry | `req~session-start-hook~1` | Unchanged carry-over; tagged tests `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-22 | The command-hook fallback signals a block via exit code | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-23 | The command-hook fallback carries PostToolUse context without a decision | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-24 | The MCP result carries additionalContext on PostToolUse | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-25 | A blocking law denies a matching action | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-26 | Out-of-scope laws are not evaluated | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-27 | A graph backend never runs on the action path | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-28 | Evaluator failure fails open | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-29 | PreToolUse latency stays within budget | Action evaluation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-30 | Reading code without recent Compass calls nudges | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-31 | A recent Compass call suppresses the nudge | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-32 | Nudges are rate limited | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-33 | Non-code and empty targets do not nudge | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-34 | A repo-wide Grep or Glob nudges | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-35 | Reads never evaluate laws | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-36 | A dotted directory name is still a directory | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-37 | Stop results carry no hookSpecificOutput | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-38 | Grep over a source directory nudges with the pattern | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-39 | PreToolUse never nudges | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-40 | The nudge never touches the index database | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-41 | The nudge path stays within the hook latency budget | `req~compass-nudge~1` | Unchanged carry-over; tagged tests `unit/check.test.ts`, `integration/hooks.test.ts`, `unit/hooks.test.ts` green in `npm test` (833/833) |
| LAW-42 | Passed, failed, and unknown are distinguished in one run | Deterministic batch verification | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-43 | Missing index does not silently pass graph laws | Deterministic batch verification | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-44 | Engine filter restricts what runs | Deterministic batch verification | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-45 | Both transports return the same result | Deterministic batch verification | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-46 | Forbidden dependency is detected with provenance | Dependency backend | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-47 | Group matching forbids cross-feature imports with one rule | Dependency backend | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-48 | Unresolved edges are reported as unknown, not passed | Dependency backend | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-49 | Minimal cycle is reported instead of the whole component | `req~graph-honours-scope~1` | Unchanged carry-over; tagged tests `unit/graph.test.ts` green in `npm test` (833/833) |
| LAW-50 | Intra-file self-dependency is not a cycle | `req~graph-honours-scope~1` | Unchanged carry-over; tagged tests `unit/graph.test.ts` green in `npm test` (833/833) |
| LAW-51 | Graph law scope excludes out-of-scope files | `req~graph-honours-scope~1` | Unchanged carry-over; tagged tests `unit/graph.test.ts` green in `npm test` (833/833) |
| LAW-52 | Out-of-scope test files are not module cycles | `req~graph-honours-scope~1` | Unchanged carry-over; tagged tests `unit/graph.test.ts` green in `npm test` (833/833) |
| LAW-53 | Cycle detection survives deep import chains | `req~graph-honours-scope~1` | Unchanged carry-over; tagged tests `unit/graph.test.ts` green in `npm test` (833/833) |
| LAW-54 | A deps rule payload is validated | Discriminated law verification model | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-55 | A legacy path law still validates | Discriminated law verification model | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-56 | A malformed rule payload is rejected at validation time | Discriminated law verification model | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-57 | Loaded laws are recorded | Context coverage audit | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-58 | Doctor reports missing coverage | Context coverage audit | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-59 | Malformed glob is caught at generation time | Glob validation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-60 | Doctor reports graph-engine availability | Glob validation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-61 | Conforming project exits zero | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-62 | New violation exits one | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-63 | Incomplete verification is distinguishable from success | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-64 | Shallow clone under --ci exits three | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-65 | Unwritable SARIF path exits three | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-66 | Unknown flag combination exits two | CI verification command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-67 | SARIF declares one rule per loaded law | SARIF output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-68 | Locations are repository-relative | SARIF output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-69 | Skips are visible in the SARIF run | SARIF output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-70 | Coverage claims require traceability data | Deterministic markdown report | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-71 | Template does not use pull_request_target | CI workflow security defaults | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-72 | Permissions are denied by default | CI workflow security defaults | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-73 | Existing workflow is left untouched | CI workflow security defaults | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-74 | Missing workflow is created | CI workflow security defaults | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-75 | Semantic drift appears in SARIF | CI verification includes structural drift findings | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-76 | No anchors leaves verify unaffected | CI verification includes structural drift findings | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-77 | Draft laws do not fail verify | Optional draft status on laws | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-78 | Standards yield mergeable laws | Parse laws from standards documents | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-79 | Duplicate ids fail the parse | Parse laws from standards documents | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-80 | Unchanged second compile is a no-op | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-81 | Claude rules use paths frontmatter | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-82 | Cursor rules use globs frontmatter | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-83 | AGENTS delimited block degrades scope into prose | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-84 | Copilot does not dual-emit the same scoped law | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-85 | CodeRabbit merge preserves foreign keys | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-86 | Nested AGENTS for dense package prefixes | Multidialect law compilation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-87 | Importing rulesync output | Import third-party rules as draft laws | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-88 | Always-on budget exceeded | Always-on law token budget in doctor | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-89 | Lockfile created with baseline | `req~speclaw-lock~1` | Unchanged carry-over; tagged tests `unit/lock.test.ts` green in `npm test` (833/833) |
| LAW-90 | Line endings do not change digests | `req~speclaw-lock~1` | Unchanged carry-over; tagged tests `unit/lock.test.ts` green in `npm test` (833/833) |
| LAW-91 | Provenance block is excluded from digests | `req~speclaw-lock~1` | Unchanged carry-over; tagged tests `unit/lock.test.ts` green in `npm test` (833/833) |
| LAW-92 | A modified CLAUDE.md survives an update refresh | `req~lock-preserves-drift~1` | `integration/integrity.test.ts` "an update-path scaffold refresh keeps a drifted CLAUDE.md digest" + "the scaffold report names the preserved drifted file…" (red: `.red-2.txt`); manual M4/M5: update warned `run speclaw laws accept CLAUDE.md`, lock sha256 unchanged, `verify` exit 1 `integrity~digest-mismatch~1 — CLAUDE.md` |
| LAW-93 | A clean strict file is refreshed after compilation rewrites it | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "a clean strict file rewritten after the drift snapshot is refreshed"; `integration/integrity.test.ts` "…a clean AGENTS.md stays verified" |
| LAW-94 | A new strict path is added | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "a new strict path is added and an advisory edit is refreshed freely" |
| LAW-95 | An advisory edit is refreshed freely | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "a new strict path is added and an advisory edit is refreshed freely" |
| LAW-96 | Stale accepted entries are pruned | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "stale and superseded accepted[] entries are pruned" |
| LAW-97 | Laws lock preserves drift and warns | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "laws lock without --force keeps a drifted digest"; `integration/integrity.test.ts` "laws lock warns with the laws accept command for a drifted file"; manual M6 (warning printed, lock sha256 OK) |
| LAW-98 | Force without a terminal leaves the lock unchanged | `req~lock-preserves-drift~1` | `integration/integrity.test.ts` "laws lock --force without a TTY exits 1 and leaves speclaw.lock unchanged"; manual M7 (`</dev/null` → exit 1, `requires an interactive TTY`, sha256 OK) |
| LAW-99 | Force on a terminal re-baselines and records acceptance | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "laws lock --force confirmed on a terminal re-baselines…" + "rebaseline moves drifted digests to disk and records acceptance"; manual M9 on a real pty (`script`): digests listed, `y` → exit 0, `accepted[]` entry `note: "laws lock --force: tester manual"`, then `verify` exit 0 |
| LAW-100 | Force declined leaves the lock unchanged | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "laws lock --force declined or cancelled exits 1…"; manual M8 on a real pty: `n` → `Re-baseline cancelled — lockfile unchanged.`, exit 1, sha256 OK |
| LAW-101 | Force writes nothing when files change during the confirmation | `req~lock-preserves-drift~1` | `unit/lock.test.ts` "laws lock --force writes nothing when <the listed file changes again / another strict file drifts> during the prompt" + "refreshLockfile rejects a confirmed re-baseline whose digests no longer match" (red: `.red-r2.txt`). Not reproduced by hand: needs a concurrent writer during the prompt; the confirm seam does that in the test |
| LAW-102 | An unreadable lockfile is never rebuilt | `req~lock-preserves-drift~1` | `unit/lock.test.ts` `refreshLockfile refuses…` / `compileLaws reports…` × 7 bodies, `integration/integrity.test.ts` update-path scaffold + `laws lock`/`laws compile` × 7 bodies (red: `.red-b1.txt`, `.red-r2.txt`); manual M10: 8 bodies (garbage, v99, 5 structural, EACCES) × {init, update, laws compile, laws lock} = 32/32 exit 1, bytes unchanged |
| LAW-103 | Modified AGENTS.md fails verify | `req~integrity-verify~1` | Unchanged carry-over; tagged tests `unit/integrity.test.ts` green in `npm test` (833/833) |
| LAW-104 | Modified standards doc warns only | `req~integrity-verify~1` | Unchanged carry-over; tagged tests `unit/integrity.test.ts` green in `npm test` (833/833) |
| LAW-105 | Missing lockfile is soft | `req~integrity-verify~1` | Unchanged carry-over; tagged tests `unit/integrity.test.ts` green in `npm test` (833/833) |
| LAW-106 | Regenerable mirror symlink is not pinned and its absence does not fail verify | `req~integrity-verify~1` | Unchanged carry-over; tagged tests `unit/integrity.test.ts` green in `npm test` (833/833) |
| LAW-107 | Missing non-mirror managed symlink fails verify | `req~integrity-verify~1` | Unchanged carry-over; tagged tests `unit/integrity.test.ts` green in `npm test` (833/833) |
| LAW-108 | Instruction override detected | `req~injection-scan~1` | Unchanged carry-over; tagged tests `unit/scan.test.ts` green in `npm test` (833/833) |
| LAW-109 | Skill pack prose is scanned | `req~injection-scan~1` | Unchanged carry-over; tagged tests `unit/scan.test.ts` green in `npm test` (833/833) |
| LAW-110 | Accept does not clear scan errors | `req~injection-scan~1` | Unchanged carry-over; tagged tests `unit/scan.test.ts` green in `npm test` (833/833) |
| LAW-111 | No MCP tool mutates the lock | `req~laws-accept-human~1` | Unchanged carry-over; tagged tests `unit/accept.test.ts`, `unit/integrity.test.ts`, `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| LAW-112 | Accept without TTY fails | `req~laws-accept-human~1` | Unchanged carry-over; tagged tests `unit/accept.test.ts`, `unit/integrity.test.ts`, `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| LAW-113 | Lock force without TTY fails | `req~laws-accept-human~1` | `integration/integrity.test.ts` "laws lock --force without a TTY exits 1…"; manual M7 |
| LAW-114 | Accept on an unreadable lockfile fails cleanly | `req~laws-accept-human~1` | `unit/lock.test.ts` "laws accept on an unreadable lockfile exits 1 with a clean error and writes nothing" (red: `.red-r2.txt`); manual M11 on a pty: garbage / v99 / `files:"x"` → exit 1, one `✗ speclaw.lock: …` line, no stack frame, bytes unchanged |
| LAW-115 | Accept on a scan-only path reports that error alone | `req~laws-accept-human~1` | `unit/lock.test.ts` "laws accept on a scan-only path reports that error plainly, not lock-repair advice" (red: `.red-na.txt`, folded below); manual RT3-1 on a real pty with a valid lock: exit 1, one `✗ .cursorrules is scan-only …` line, 0 matches for delete/`laws lock`/left-unchanged/Repair advice, lock bytes unchanged |

## Regression — red before green

### Item 2: lock refresh launders drift (`.red-2.txt`, verbatim)

````text
# Red before green — proposal item 2 (lock refresh launders drift), captured 2026-10-07T00:47:05Z on feat/coordinator-status-updates before the lock.ts fix
$ node --test --test-name-pattern="drifted" dist-test/test/integration/integrity.test.js dist-test/test/unit/lock.test.js
✖ an update-path scaffold refresh keeps a drifted CLAUDE.md digest (44.259375ms)
✖ refreshLockfile keeps the locked digest of a drifted strict file (4.471625ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 117.430833

✖ failing tests:

test at dist-test/test/integration/integrity.test.js:63:1
✖ an update-path scaffold refresh keeps a drifted CLAUDE.md digest (44.259375ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'sha256:8e2175943b11a6829d0eda37d447a915fc56076c5a620f888d3b76d22431d445'
  - 'sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:70:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'sha256:8e2175943b11a6829d0eda37d447a915fc56076c5a620f888d3b76d22431d445',
    expected: 'sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:70:1
✖ refreshLockfile keeps the locked digest of a drifted strict file (4.471625ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'sha256:aee81771ece17d2fe3ebdbd6d7b02f715d720b6fa4568cd9e02e3e69c118609d'
  - 'sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:78:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'sha256:aee81771ece17d2fe3ebdbd6d7b02f715d720b6fa4568cd9e02e3e69c118609d',
    expected: 'sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369',
    operator: 'strictEqual',
    diff: 'simple'
  }
````

### Rework 1 B1: an unreadable or newer lock was rebuilt from disk (`.red-b1.txt`, verbatim)

````text
# Red evidence for B1 (rework 1) — captured 2026-10-07T01:05:52Z on feat/coordinator-status-updates, before the fix.
# Command: node --test --test-concurrency=1 --test-name-pattern="unreadable lockfile" dist-test/test/unit/lock.test.js dist-test/test/integration/integrity.test.js
# Exit: 1

✖ an update-path scaffold leaves an unreadable lockfile untouched (merge-conflict garbage) (48.804958ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (merge-conflict garbage) (59.392416ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (lockfileVersion 99) (39.651042ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (lockfileVersion 99) (56.598958ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (merge-conflict garbage) (5.004208ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (merge-conflict garbage) (6.813916ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (lockfileVersion 99) (2.019709ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (lockfileVersion 99) (3.715625ms)
ℹ tests 8
ℹ suites 0
ℹ pass 0
ℹ fail 8
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 361.955333

✖ failing tests:

test at dist-test/test/integration/integrity.test.js:133:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (merge-conflict garbage) (48.804958ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + '{\n' +
  +   '  "lockfileVersion": 1,\n' +
  +   '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
  +   '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "LAWS.md": {\n' +
  +   '      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/compass.md": {\n' +
  +   '      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/architecture.md": {\n' +
  +   '      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/backend-standards.md": {\n' +
  +   '      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/conventions.md": {\n' +
  +   '      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/documentation.md": {\n' +
  +   '      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/frontend-standards.md": {\n' +
  +   '      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/lawbook.md": {\n' +
  +   '      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/testing-standards.md": {\n' +
  +   '      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  +   '  "symlinks": {},\n' +
  +   '  "accepted": []\n' +
  +   '}\n'
  - '<<<<<<< HEAD\n{ "lockfileVersion": 1 }\n=======\n{}\n>>>>>>> theirs\n'
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/integration/integrity.test.js:140:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '<<<<<<< HEAD\n{ "lockfileVersion": 1 }\n=======\n{}\n>>>>>>> theirs\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:144:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (merge-conflict garbage) (59.392416ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:30f533918fdf…
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:133:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (lockfileVersion 99) (39.651042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
  +   '  "lockfileVersion": 1,\n' +
  -   '  "lockfileVersion": 99,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n' +
  -   '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
      '      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n' +
  -   '      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "LAWS.md": {\n' +
      '      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n' +
      '      "ownership": "advisory"\n' +
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/integration/integrity.test.js:140:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 99,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:144:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (lockfileVersion 99) (56.598958ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:30f533918fdf…
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:213:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (merge-conflict garbage) (5.004208ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/unit/lock.test.js:218:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:223:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (merge-conflict garbage) (6.813916ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + '{\n' +
  +   '  "lockfileVersion": 1,\n' +
  +   '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
  +   '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  +   '  "symlinks": {},\n' +
  +   '  "accepted": []\n' +
  +   '}\n'
  - '<<<<<<< HEAD\n{ "lockfileVersion": 1 }\n=======\n{}\n>>>>>>> theirs\n'
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/unit/lock.test.js:228:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '<<<<<<< HEAD\n{ "lockfileVersion": 1 }\n=======\n{}\n>>>>>>> theirs\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:213:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (lockfileVersion 99) (2.019709ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/unit/lock.test.js:218:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:223:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (lockfileVersion 99) (3.715625ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
  +   '  "lockfileVersion": 1,\n' +
  -   '  "lockfileVersion": 99,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  -   '      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  -   '      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "docs/standards/base-standards.md": {\n' +
      '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
      '      "ownership": "advisory"\n' +
  
      at TestContext.<anonymous> (file://~/Projects/speclaw/dist-test/test/unit/lock.test.js:228:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 99,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }
````

### Rework 2 R1/R2/R4: prompt race, structurally invalid lock, accept crash (`.red-r2.txt`, verbatim)

````text
# Rework 2 red run (2026-10-07T01:17:18Z), before the R1/R2/R4 fix
# cmd: npx tsc -p tsconfig.test.json && node scripts/prep-test-assets.mjs && node --test --test-concurrency=1 dist-test/test/unit/lock.test.js dist-test/test/integration/integrity.test.js
# exit: 1
✔ scaffold creates speclaw.lock at root (33.794041ms)
✔ speclaw laws lock and scan via CLI (115.953417ms)
✔ doctor reports lock root status (15.9565ms)
✔ doctor reports external imports and outside-pipeline paths (14.479791ms)
✔ an update-path scaffold refresh keeps a drifted CLAUDE.md digest (36.348917ms)
✔ the scaffold report names the preserved drifted file; a clean AGENTS.md stays verified (32.348334ms)
✔ laws lock --force without a TTY exits 1 and leaves speclaw.lock unchanged (55.939417ms)
✔ laws lock warns with the laws accept command for a drifted file (58.019416ms)
✔ an update-path scaffold leaves an unreadable lockfile untouched (merge-conflict garbage) (30.825083ms)
✔ laws lock and laws compile exit 1 on an unreadable lockfile (merge-conflict garbage) (112.598375ms)
✔ an update-path scaffold leaves an unreadable lockfile untouched (lockfileVersion 99) (30.988333ms)
✔ laws lock and laws compile exit 1 on an unreadable lockfile (lockfileVersion 99) (114.87025ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (files is a string) (32.210042ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (files is a string) (56.940209ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (files is an array) (32.15875ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (files is an array) (55.3565ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (a files entry without a string digest) (30.861666ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (a files entry without a string digest) (58.737167ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (accepted is not an array) (30.407417ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (accepted is not an array) (58.691875ms)
✖ an update-path scaffold leaves an unreadable lockfile untouched (symlinks is a string) (30.798041ms)
✖ laws lock and laws compile exit 1 on an unreadable lockfile (symlinks is a string) (59.553458ms)

speclaw laws lock --force
  CLAUDE.md
  expected sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369
  actual   sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3
{
  "lockfileVersion": 1,
  "generator": "@esneiderbravo/speclaw@2.0.7",
  "algorithm": "sha256",
  "root": "sha256:e95a4d059986b2223f770c2d31abe51d1aaf580e604da9d79bc4f1fb7b280da0",
  "files": {
    "AGENTS.md": {
      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",
      "ownership": "strict"
    },
    "CLAUDE.md": {
      "digest": "sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3",
      "ownership": "strict"
    },
    "docs/standards/base-standards.md": {
      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",
      "ownership": "advisory"
    }
  },
  "symlinks": {},
  "accepted": [
    {
      "path": "CLAUDE.md",
      "digest": "sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3",
      "at": "2026-10-07T01:17:09.948Z",
      "by": "esneiderbravo",
      "note": "laws lock --force: reviewed upstream"
    }
  ]
}

speclaw laws lock --force
  CLAUDE.md
  expected sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369
  actual   sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3
  ! Re-baseline cancelled — lockfile unchanged.
{
  "lockfileVersion": 1,
  "generator": "@esneiderbravo/speclaw@2.0.7",
  "algorithm": "sha256",
  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",
  "files": {
    "AGENTS.md": {
      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",
      "ownership": "strict"
    },
    "CLAUDE.md": {
      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",
      "ownership": "strict"
    },
    "docs/standards/base-standards.md": {
      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",
      "ownership": "advisory"
    }
  },
  "symlinks": {},
  "accepted": []
}

speclaw laws lock
  ✓ Wrote speclaw.lock — 3 file(s), 0 symlink(s), root sha256:92dbd5b0275e…
  ! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md
  ✗ speclaw.lock: unreadable (Unexpected token '<', "<<<<<<< HE"... is not valid JSON) — speclaw.lock was left unchanged. Repair it (resolve merge markers, or upgrade speclaw for a newer lockfileVersion); to start over, delete it and run `speclaw laws lock`.
  ✗ speclaw.lock: unreadable (Unexpected token '<', "<<<<<<< HE"... is not valid JSON) — speclaw.lock was left unchanged. Repair it (resolve merge markers, or upgrade speclaw for a newer lockfileVersion); to start over, delete it and run `speclaw laws lock`.

speclaw laws lock --force
  CLAUDE.md
  expected sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369
  actual   sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3

speclaw laws lock
  ✓ Wrote speclaw.lock — 3 file(s), 0 symlink(s), root sha256:db296315c567…
  ! CLAUDE.md re-baselined by --force (recorded in accepted[]).

speclaw laws lock --force
  CLAUDE.md
  expected sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369
  actual   sha256:13a576f4c9a0a476974d1a29529fa017201df439892bdf8acdb346a7e2ea95b3

speclaw laws lock
  ✓ Wrote speclaw.lock — 3 file(s), 0 symlink(s), root sha256:0df937af974c…
  ! CLAUDE.md re-baselined by --force (recorded in accepted[]).
✔ canonicalize normalizes CRLF to LF and trims EOL spaces (0.973333ms)
✔ provenance block is excluded from digests (0.335625ms)
✔ stripCompassMapBlock ignores regenerable map body (0.1175ms)
✔ refreshLockfile writes speclaw.lock at repo root (3.419667ms)
✔ canonicalize collapses trailing blank lines (0.101542ms)
✔ discover ignores non-symlink at speclaw rules path (0.727583ms)
✔ extractSpeclawYamlBlock digests only marked region (0.145917ms)
✔ lockfile is JSON at repository root not under .speclaw (1.612041ms)
✔ refreshLockfile keeps the locked digest of a drifted strict file (1.314708ms)
✔ driftedStrictPaths names only modified strict files (1.895542ms)
✔ a digest recorded in accepted[] is not drift (1.394083ms)
✔ refresh reports the preserved drifted path and keeps its digest (1.483834ms)
✔ a clean strict file rewritten after the drift snapshot is refreshed (1.7495ms)
✔ a new strict path is added and an advisory edit is refreshed freely (2.576625ms)
✔ stale and superseded accepted[] entries are pruned (1.794875ms)
✔ rebaseline moves drifted digests to disk and records acceptance (1.6665ms)
✔ laws lock --force confirmed on a terminal re-baselines and records acceptance (7.317833ms)
✔ laws lock --force declined or cancelled exits 1 and leaves the lock unchanged (1.758125ms)
✔ laws lock --force with nothing drifted asks nothing (2.556375ms)
✔ laws lock without --force keeps a drifted digest (1.981875ms)
✔ laws lock exits 1 on an unreadable lockfile without rewriting it (1.981917ms)
✖ laws lock --force writes nothing when a listed file changes again during the prompt (2.669959ms)
✖ laws lock --force writes nothing when an unlisted strict file drifts during the prompt (2.013875ms)
✖ laws accept on an unreadable lockfile exits 1 with a clean error and writes nothing (1.528625ms)
✔ refreshLockfile refuses to overwrite an unreadable lockfile (merge-conflict garbage) (1.510541ms)
✔ compileLaws reports and leaves an unreadable lockfile untouched (merge-conflict garbage) (5.459375ms)
✔ refreshLockfile refuses to overwrite an unreadable lockfile (lockfileVersion 99) (1.990208ms)
✔ compileLaws reports and leaves an unreadable lockfile untouched (lockfileVersion 99) (3.650333ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (files is a string) (1.805917ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (files is a string) (4.428375ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (files is an array) (1.646667ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (files is an array) (3.352916ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (a files entry without a string digest) (1.715125ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (a files entry without a string digest) (3.508459ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (accepted is not an array) (2.029292ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (accepted is not an array) (3.859875ms)
✖ refreshLockfile refuses to overwrite an unreadable lockfile (symlinks is a string) (1.897542ms)
✖ compileLaws reports and leaves an unreadable lockfile untouched (symlinks is a string) (3.240167ms)
ℹ tests 60
ℹ suites 0
ℹ pass 37
ℹ fail 23
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1328.59475

✖ failing tests:

test at dist-test/test/integration/integrity.test.js:151:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (files is a string) (32.210042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "LAWS.md": {\n' +
  +   '      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/compass.md": {\n' +
  +   '      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/architecture.md": {\n' +
  +   '      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/backend-standards.md": {\n' +
  +   '      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/conventions.md": {\n' +
  +   '      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/documentation.md": {\n' +
  +   '      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/frontend-standards.md": {\n' +
  +   '      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/lawbook.md": {\n' +
  +   '      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/testing-standards.md": {\n' +
  +   '      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  -   '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
  -   '  "files": "x",\n' +
      '  "symlinks": {},\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": "x",\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:162:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (files is a string) (56.940209ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:30f533918fdf…
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:179:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:151:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (files is an array) (32.15875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "LAWS.md": {\n' +
  +   '      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/compass.md": {\n' +
  +   '      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/architecture.md": {\n' +
  +   '      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/backend-standards.md": {\n' +
  +   '      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/conventions.md": {\n' +
  +   '      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/documentation.md": {\n' +
  +   '      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/frontend-standards.md": {\n' +
  +   '      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/lawbook.md": {\n' +
  +   '      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    },\n' +
  +   '    "docs/standards/testing-standards.md": {\n' +
  +   '      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  -   '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
  -   '  "files": [],\n' +
      '  "symlinks": {},\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:8beec98bd674f1cc7e9af642ea112940e1b5c762809d48ca436fd06c3cdc0d32",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:6bb98555e40f217c680a0f4d66f488fbe6d5d9e98abe66c04f365cae67c1094b",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": [],\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:162:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (files is an array) (55.3565ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:30f533918fdf…
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:179:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:151:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (a files entry without a string digest) (30.861666ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3403a5cd3f3cf82e466ab8c97a09d41d9376b17bb104c1b763e5c7cdb3929692",\n' +
  -   '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
      '      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3403a5cd3f3cf82e466ab8c97a09d41d9376b17bb104c1b763e5c7cdb3929692",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:162:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (a files entry without a string digest) (58.737167ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:fc4f6b2d9c7f…
    ! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:179:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:151:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (accepted is not an array) (30.407417ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  ... Skipped lines
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
      '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
  ...
      '  "symlinks": {},\n' +
  +   '  "accepted": []\n' +
  -   '  "accepted": {}\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": {}\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:162:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (accepted is not an array) (58.691875ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:dc90950ce0cc…
    ! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:179:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:151:5
✖ an update-path scaffold leaves an unreadable lockfile untouched (symlinks is a string) (30.798041ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  ... Skipped lines
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
      '  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n' +
  ...
      '  },\n' +
  +   '  "symlinks": {},\n' +
  -   '  "symlinks": "x",\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:158:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:61b25dbd16a069437c32623d66359b52a82a22c2c78c824734b0f4c7379aecfb",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:0b05f9e7a52fc9e5535c35a9355da1b781b82e16a450b6969c08165ec1893458",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:0f58d9cace6fce1cd962bb0b11c336dbcff56437759a07880b90bfe9c1b39dac",\n      "ownership": "strict"\n    },\n    "LAWS.md": {\n      "digest": "sha256:2fe8fd318b255170824ab13fa58f9d061482e893d41b9a18aec8853dbb5e9a8e",\n      "ownership": "advisory"\n    },\n    "docs/compass.md": {\n      "digest": "sha256:f788fd97a655d3f2a6185d3546dbbcbab14f180309f6490595a714ab4d72db35",\n      "ownership": "advisory"\n    },\n    "docs/standards/architecture.md": {\n      "digest": "sha256:fb2f117c88580e0a35223d88c1b6baa320ddcdbc741e55ffec8a181abd11a18e",\n      "ownership": "advisory"\n    },\n    "docs/standards/backend-standards.md": {\n      "digest": "sha256:8ca56b11de3a989a93e2f6af6b70f9b6d974a3c0e8ecd0000e229cb856ad83ab",\n      "ownership": "advisory"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:31516df17587e02a8246ead034a2475b676b63731d23c799821eaebfa6c72409",\n      "ownership": "advisory"\n    },\n    "docs/standards/conventions.md": {\n      "digest": "sha256:1e1d0e29e099cb3e33d16392107b96bf8d31f92fd35a85847819259c7b412806",\n      "ownership": "advisory"\n    },\n    "docs/standards/documentation.md": {\n      "digest": "sha256:3856eb583af824d2b2531d8b16ca0a91e287d0e238f5442bb6cbe95611bd69e4",\n      "ownership": "advisory"\n    },\n    "docs/standards/frontend-standards.md": {\n      "digest": "sha256:b75c18cd5b6910918c343ed20bd832bc8fa5f9b5e7f4b7b0859e64a3f1c609be",\n      "ownership": "advisory"\n    },\n    "docs/standards/lawbook.md": {\n      "digest": "sha256:2b4be6e131e076f82ccfc57bedb6b010d6191cf286ce751dcfc88b8f3d3e234a",\n      "ownership": "advisory"\n    },\n    "docs/standards/testing-standards.md": {\n      "digest": "sha256:78a1f75208a88a9c582bb39c0bd09ed8bc3ddd6f73a9a9b987812aaa63d07c47",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": "x",\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/integrity.test.js:162:5
✖ laws lock and laws compile exit 1 on an unreadable lockfile (symlinks is a string) (59.553458ms)
  AssertionError [ERR_ASSERTION]: laws lock: 
  speclaw laws lock
    ✓ Wrote speclaw.lock — 2 file(s), 0 symlink(s), root sha256:dc90950ce0cc…
    ! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md
  
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/integrity.test.js:179:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:282:5
✖ laws lock --force writes nothing when a listed file changes again during the prompt (2.669959ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  undefined !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:293:16)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:282:5
✖ laws lock --force writes nothing when an unlisted strict file drifts during the prompt (2.013875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  undefined !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:293:16)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:299:1
✖ laws accept on an unreadable lockfile exits 1 with a clean error and writes nothing (1.528625ms)
  Error: speclaw.lock: unreadable (Unexpected token '<', "<<<<<<< HE"... is not valid JSON)
      at readLockfile (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/foundation/lock.js:75:15)
      at runAccept (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/cli/commands/laws.js:239:18)
      ... 6 lines matching cause stack trace ...
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25) {
    [cause]: SyntaxError: Unexpected token '<', "<<<<<<< HE"... is not valid JSON
        at JSON.parse (<anonymous>)
        at readLockfile (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/foundation/lock.js:72:20)
        at runAccept (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/cli/commands/laws.js:239:18)
        at runLaws (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/cli/commands/laws.js:99:15)
        at file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:306:44
        at captureStderr (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:255:15)
        at file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:306:24
        at inProject (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:185:15)
        at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:305:24)
        at Test.runInAsyncScope (node:async_hooks:227:14)
  }

test at dist-test/test/unit/lock.test.js:346:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (files is a string) (1.805917ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:351:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:356:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (files is a string) (4.428375ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
  -   '  "files": "x",\n' +
      '  "symlinks": {},\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:361:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": "x",\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:346:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (files is an array) (1.646667ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:351:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:356:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (files is an array) (3.352916ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  +   '  "files": {\n' +
  +   '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  +   '      "ownership": "strict"\n' +
  +   '    },\n' +
  +   '    "docs/standards/base-standards.md": {\n' +
  +   '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
  +   '      "ownership": "advisory"\n' +
  +   '    }\n' +
  +   '  },\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
  -   '  "files": [],\n' +
      '  "symlinks": {},\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:361:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": [],\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:346:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (a files entry without a string digest) (1.715125ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:351:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:356:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (a files entry without a string digest) (3.508459ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:d3ede219ec557996156a7208eb29db12343a2bcd417b49590e6b9ec8ca5bdc19",\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  -   '      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "CLAUDE.md": {\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:361:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:d3ede219ec557996156a7208eb29db12343a2bcd417b49590e6b9ec8ca5bdc19",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:346:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (accepted is not an array) (2.029292ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:351:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:356:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (accepted is not an array) (3.859875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  ... Skipped lines
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  -   '      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  -   '      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "docs/standards/base-standards.md": {\n' +
      '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
      '      "ownership": "advisory"\n' +
  ...
      '  "symlinks": {},\n' +
  +   '  "accepted": []\n' +
  -   '  "accepted": {}\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:361:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": {}\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:346:5
✖ refreshLockfile refuses to overwrite an unreadable lockfile (symlinks is a string) (1.897542ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:351:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /speclaw\.lock/,
    operator: 'throws',
    diff: 'simple'
  }

test at dist-test/test/unit/lock.test.js:356:5
✖ compileLaws reports and leaves an unreadable lockfile untouched (symlinks is a string) (3.240167ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
    '{\n' +
      '  "lockfileVersion": 1,\n' +
      '  "generator": "@esneiderbravo/speclaw@2.0.7",\n' +
      '  "algorithm": "sha256",\n' +
  +   '  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n' +
  -   '  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n' +
      '  "files": {\n' +
      '    "AGENTS.md": {\n' +
  +   '      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n' +
  -   '      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "CLAUDE.md": {\n' +
  +   '      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n' +
  -   '      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n' +
      '      "ownership": "strict"\n' +
      '    },\n' +
      '    "docs/standards/base-standards.md": {\n' +
      '      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n' +
      '      "ownership": "advisory"\n' +
      '    }\n' +
      '  },\n' +
  +   '  "symlinks": {},\n' +
  -   '  "symlinks": "x",\n' +
      '  "accepted": []\n' +
      '}\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:361:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:3849900e56ad970bc3caa9321036caa4dabb8b8879a8fb9f7181ab619824275f",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:f57c3f3b99e6be1979f72ddd537c4c1187cc29dc3a79d24c12f4d62afdd589d3",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:b4bb09a96ba3541439a64969d0aa51d533e896c9188014c69b7a7b98aa2bc8a5",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": {},\n  "accepted": []\n}\n',
    expected: '{\n  "lockfileVersion": 1,\n  "generator": "@esneiderbravo/speclaw@2.0.7",\n  "algorithm": "sha256",\n  "root": "sha256:92dbd5b0275ed6ac9141135ead2f0a0bfc756dc7c8414928440a5a8922eb224b",\n  "files": {\n    "AGENTS.md": {\n      "digest": "sha256:070a8ff8c31696dd57f1d0f8dfbfb1c9151ebd903c5d7e41d9dbf4133d54f84e",\n      "ownership": "strict"\n    },\n    "CLAUDE.md": {\n      "digest": "sha256:3f976a31785022dfd2e0454d8a8b619da21f85aeb73cb1cbb6f1d4e6d3d47369",\n      "ownership": "strict"\n    },\n    "docs/standards/base-standards.md": {\n      "digest": "sha256:a35e972177595b0735e0231799361624bdff74ee9393efed07c65c8f9cad31f7",\n      "ownership": "advisory"\n    }\n  },\n  "symlinks": "x",\n  "accepted": []\n}\n',
    operator: 'strictEqual',
    diff: 'simple'
  }
````

### Rework 3 N-a: scan-only accept error wrapped in lock-repair advice (`.red-na.txt`, verbatim)

Captured by the implementer before the R3.2 fix in `runAccept`: the new `unit/lock.test.ts` test failed 1/1, because the scan-only error was wrapped in the unreadable-lock advice ("delete it and run `speclaw laws lock`"). After the fix the same test passes ("laws accept on a scan-only path reports that error plainly, not lock-repair advice" ✔ in `npm test` 833/833). Folded verbatim from `reports/.red-na.txt`, which was then deleted.

````text

speclaw laws accept
  .cursorrules
  actual   sha256:05d40607d049a7eda17bd46e9be7cda6cfc6138e819b97f17357d6e0300f9667
✖ laws accept on a scan-only path reports that error plainly, not lock-repair advice (7.622042ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 76.993083

✖ failing tests:

test at dist-test/test/unit/lock.test.js:344:1
✖ laws accept on a scan-only path reports that error plainly, not lock-repair advice (7.622042ms)
  AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /delete it/. Input:
  
  '  ✗ .cursorrules is scan-only — digests are not locked for this path. — speclaw.lock was left unchanged. Repair it (resolve merge markers, or upgrade speclaw for a newer lockfileVersion); to start over, delete it and run `speclaw laws lock`.\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/lock.test.js:355:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '  ✗ .cursorrules is scan-only — digests are not locked for this path. — speclaw.lock was left unchanged. Repair it (resolve merge markers, or upgrade speclaw for a newer lockfileVersion); to start over, delete it and run `speclaw laws lock`.\n',
    expected: /delete it/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }
````

## Rework 3 re-test (2026-10-06)

Final re-test after rework 3 (review PASS). This closes the N-a finding from the previous test run (see "Reviewer nit N-a" above, kept for history) and checks the doctor remedy (R3.3).

Gates in `/Users/esneiderbravo/Projects/speclaw`: `npm run check` exit 0; `npm run build` exit 0; `npm test` exit 0, tests 833 / pass 833 / fail 0, all files 86.32 / 82.68 / 88.22 (floor 80); security subset (the four files above) 93/93; with `unit/update.test.js` added, 108/108. `lawbook_change` validate `valid: true`, `issues: []`. Coverage (after reindex, `onlyDefects`): `Coverage clean: 26/26 shallow, 26 deep`. Read-only `verify --json` on this repo: exit 1 from the same 11 `drift~changed-semantic` findings, **0 `integrity~*`** (unchanged; see below). `laws verify` exit 0.

Manual runs used the new throwaway repo `/tmp/speclaw-rt3.yY1t3f/p1` (`git init` + `speclaw init --yes`, committed) with `HOME=/tmp/speclaw-rt3.yY1t3f/home` and the registry stub preload (`cli.md`, "Rework 3 re-test").

| # | What | Observed |
|---|------|----------|
| RT3-1 | N-a fixed: `printf 'scan-only rule\n' > .cursorrules; script -q na.ts node $CLI laws accept .cursorrules --note x` on a valid lock, answered `y` | `EXIT=1`; stderr ends with exactly `✗ .cursorrules is scan-only — digests are not locked for this path.`; advice grep (`delete it\|speclaw laws lock\|left unchanged\|Repair it`) = 0; `speclaw.lock` sha256 `11feeb62ececc807…` before = after (`BYTES-UNCHANGED`) |
| RT3-2 | R3.3 doctor remedy, garbage lock (merge markers) | `doctor` exit 1: `✗ rule lockfile speclaw.lock: unreadable (Unexpected token '<', "<<<<<<< HE"... is not valid JSON)` → `resolve the merge conflict in speclaw.lock or restore it from git (git checkout -- speclaw.lock); upgrade speclaw if the lockfileVersion is newer. Last resort: delete it and run speclaw laws lock — this re-baselines every pinned file and accepts any pending drift`. A bare `speclaw laws lock` is no longer the suggested fix. `doctor --json` → `cfg.integrity.lock` `status: "error"` with the same `remedy`. Lock bytes unchanged |
| RT3-2b | same, `lockfileVersion: 99` | exit 1; `unsupported lockfileVersion 99 (max 1)` and the same remedy. With a valid lock: `✓ rule lockfile speclaw.lock root matches (12 files)` |
| RT3-4 | Follow-up N-c checked | In a scratch repo `/tmp/speclaw-rt3.yY1t3f/nc` with a real merge conflict on `speclaw.lock`: `git checkout -- speclaw.lock` → `error: path 'speclaw.lock' is unmerged`, exit 1; `git checkout HEAD -- speclaw.lock` → exit 0 and restores our side. The remedy's `git checkout -- speclaw.lock` form does not work in the merge-conflict case it names. This is a low, wording-only problem: the remedy also says "resolve the merge conflict", and nothing is written. It is recorded as follow-up N-c in `tasks.md`, not a blocker |

Isolation: this repo's `speclaw.lock` / `CLAUDE.md` / `AGENTS.md` sha256 were `63d45909…` / `edfca9c6…` / `3c8610ca…` after all runs, matching the values recorded above, and `git status --short` is empty for them.

## Pre-existing / unrelated failures

- **Top-level `verify` exits 1 on this repo** because of 11 `drift~changed-semantic` findings and 0 integrity findings (`node dist/cli/index.js verify --json`, read-only). They are sealed spec anchors whose bodies this change (and the sibling) edited: `cli → scaffold` ×2, `project-update → scaffold` ×1, `law-enforcement → handleHarness` ×4, `lawbook-workflow → specArchive` ×2, and **`spec-drift → specArchive` ×2**. Archiving reseals the capabilities whose canonical spec is promoted (`cli`, `law-enforcement`, `lawbook-workflow`, `project-update`). `spec-drift` is **not** one of this change's capabilities, so its 2 anchors stay stale after the archive unless the coordinator reseals them (`speclaw drift --reseal --capability spec-drift`, a human/coordinator decision). This is expected anchor maintenance for a change that edits `specArchive`, not a lock or integrity regression.
- R3 (pre-existing, follow-up in `tasks.md`): `laws scan` skips the injection scan when the lock is unreadable. Not touched here.

## Pending manual steps

None. The prompt-race (R1) paths are covered by the seam tests only, by design (they need a concurrent writer).

## Verdict

PASS (rework 3 re-test: N-a fixed and verified on a real pty; doctor remedy verified; N-c recorded as a follow-up)
