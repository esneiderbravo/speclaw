# Backend report — lock-regenerable-symlink

**Discipline:** backend · **Change:** lock-regenerable-symlink · **Date:** 2026-10-06 ·
**Branch:** fix/lock-regenerable-symlink · **cwd:** /Users/esneiderbravo/Projects/speclaw

Toolchain: Node v24.17.0, macOS arm64. Built CLI: `/Users/esneiderbravo/Projects/speclaw/dist/cli/index.js` (2.0.5).

## Regression test — failing before the fix

Tree: HEAD `cad8da0` with only `test/unit/integrity.test.ts` changed (no `src/` edits).

Command:

```bash
npm run pretest && node --test dist-test/test/unit/integrity.test.js
```

Result: exit 1 — `tests 21 · pass 18 · fail 3`.

```text
✔ non-mirror symlink retarget fails integrity (1.891875ms)
✖ refreshing the lock does not pin the regenerable .claude/rules/speclaw mirror (2.106416ms)
✖ legacy lock pinning a missing .claude/rules/speclaw mirror warns without failing (1.340958ms)
✖ legacy lock pinning a retargeted .claude/rules/speclaw mirror warns without failing (1.726959ms)
...
✔ missing non-mirror managed symlink fails (0.891625ms)
✔ matching symlink is ok; scan-only mode skips digests (1.481958ms)
ℹ tests 21
ℹ pass 18
ℹ fail 3

test at dist-test/test/unit/integrity.test.js:98:1
✖ refreshing the lock does not pin the regenerable .claude/rules/speclaw mirror (2.106416ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + {
  +   '.claude/rules/speclaw': {
  +     target: '../../ai-specs/rules'
  +   }
  + }
  - {}
    actual: { '.claude/rules/speclaw': { target: '../../ai-specs/rules' } },
    expected: {},

test at dist-test/test/unit/integrity.test.js:108:1
✖ legacy lock pinning a missing .claude/rules/speclaw mirror warns without failing (1.340958ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  false !== true            (r.ok)

test at dist-test/test/unit/integrity.test.js:120:1
✖ legacy lock pinning a retargeted .claude/rules/speclaw mirror warns without failing (1.726959ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  false !== true            (r.ok)
```

The three failures reproduce the bug: the refreshed lock pins the gitignored
mirror link, and `verifyIntegrity` fails (`ok: false`) when that pinned link is
missing or retargeted. The non-mirror symlink tests pass before and after the
fix, which shows strict behaviour for other managed links is kept.

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `npm run check` | PASS — exit 0. Prettier "All matched files use Prettier code style!", ESLint clean. |
| Type-check + compile | `npm run build` | PASS — exit 0 (`tsc` strict + `copy-assets: copied assets for 3 module(s)`). |
| Unit + e2e tests with coverage | `npm test` | PASS — exit 0. `tests 621 · pass 621 · fail 0 · skipped 0 · todo 0` (26.9 s). Coverage gate (80/80/80) met: all files line 85.54 % · branch 82.06 % · funcs 87.68 %. |
| Coverage of touched files | (same run) | `foundation/lock.js` line 98.67 % · branch 87.62 % · funcs 100 % (uncovered 72-73, 278-279, not on changed lines). `foundation/integrity.js` line 99.38 % · branch 93.33 % (uncovered 238-239, the scan-warn push, not changed). Every changed branch (mirror skip in `snapshotLockEntries`, warn/error split for missing and retargeted links) is executed by the tests below. |
| Regression red → green | `node --test dist-test/test/unit/integrity.test.js` | Red on HEAD `cad8da0` (3 fail, see above); green on the branch (all integrity tests pass inside the 621). |
| CLI red → green | HEAD `cad8da0` built in a throwaway worktree `/tmp/speclaw-head` vs branch build | On the same scratch clone: HEAD `speclaw update` pins `.claude/rules/speclaw` and, with the link removed, `speclaw verify --ci` exits **1** (`1 failed`, `integrity~symlink~1`). The branch build exits **0** on that same legacy lock with a warning. See cli.md. |

## Tests added / updated

`test/unit/integrity.test.ts` (implementer; reviewed and run by the tester; no tests added by the tester):

- Added: `refreshing the lock does not pin the regenerable .claude/rules/speclaw mirror`
- Added: `legacy lock pinning a missing .claude/rules/speclaw mirror warns without failing`
- Added: `legacy lock pinning a retargeted .claude/rules/speclaw mirror warns without failing`
- Updated (retargeted to a non-mirror `tools/managed` link through a hand-pinned entry): `non-mirror symlink retarget fails integrity`, `missing non-mirror managed symlink fails`, `matching symlink is ok; scan-only mode skips digests`
- Helper `pinSymlink` writes a lock entry by hand. This is the only way to get a non-mirror symlink into the lock, because `discoverIntegrityPaths` only probes `.claude/rules/speclaw`.

## Spec-scenario coverage — `req~integrity-verify~1`

| Scenario | Verified by |
| --- | --- |
| Modified AGENTS.md fails verify | Existing unit test `modified AGENTS.md fails integrity` (green). This change does not touch it: `AGENTS.md` stays `strict` in `integrityPolicy`. |
| Modified standards doc warns only | Existing unit tests `modified standards doc warns only` and `missing strict file fails; missing advisory warns` (green, unchanged). |
| Missing lockfile is soft | Existing unit tests `missing lockfile is soft with guidance` and `missing lock with integrity-only skips scan` (green, unchanged). |
| Regenerable mirror symlink is not pinned and its absence does not fail verify | Unit: `refreshing the lock does not pin…`, `legacy lock pinning a missing…`, and `legacy lock pinning a retargeted…`. CLI scenarios a–d (cli.md): after `init`, `update` ×2 and `laws lock` ×2, `"symlinks": {}` and the lock is byte-identical (sha256 `9a27bd17…`). On a clean clone, verify exits 0 with the link removed and with it dangling. With a legacy pinned lock, verify exits 0 and reports `! integrity~symlink~1 — .claude/rules/speclaw` as a `warn` (missing and retargeted). `update` and `laws lock` each drop the entry back to `{}`, giving the same lock bytes as the origin. |
| Missing non-mirror managed symlink fails verify | Unit: `missing non-mirror managed symlink fails` and `non-mirror symlink retarget fails integrity` (severity `error`, `ok: false`). CLI: hand-pinned `tools/managed`. Verify exits **1** when it is retargeted and **1** when it is missing. |

## Pre-existing / unrelated failures

None in the gates. In the scratch projects, every `speclaw verify` also lists `law~no-module-cycles~1 — skipped: no-index`. This is the adapted-seed graph law that has no `.speclaw/index.db` (scratch init ran with `--no-index`). It is skipped rather than failed, does not change the exit code, and is unrelated to integrity.

## Findings (advisory, non-blocking)

1. **"Gitignored" is not the default.** bugfix.md §2 says "the scaffold gitignores both `.claude/rules/speclaw` and `ai-specs/`". The delta requirement text and the code comments in `lock.ts`/`integrity.ts` likewise call the link "gitignored". A fresh `speclaw init --agents claude` only adds `ai-specs/` to `.gitignore`. `.claude/rules/speclaw` shows up as untracked and gets committed as a dangling link. This is by design: `test/unit/agents.test.ts:50` asserts speclaw never ignores `.claude/` symlinked subdirs. The speclaw repo ignores the link by hand (`.gitignore:27`), and so, presumably, did the consumer that reported the bug. The fix is correct in both setups. Both were verified: committed dangling link → verify exit 0, link absent → exit 0, and the lock is stable either way. Only the wording overstates things. Suggest "typically gitignored / absent or dangling on clean clones" on the next touch. This does not block archive.
2. Tester process note: while looking for flags, `speclaw init --help` was run in the repo cwd. `init` has no `--help` and ran a real `init`, which modified three tracked files (`.claude/settings.json`, `docs/compass.md`, `speclaw.lock`). None of them were modified at session start, and all three were restored with `git checkout --`. The working tree now matches the session-start status. Leftover effects are only in gitignored local artifacts (`.speclaw/index.db` reindexed, `ai-specs/` regenerated). Separately, `init --help` / `verify --help` running the command instead of printing help is a CLI papercut worth its own change.

## Pending manual steps

None.

## Verdict

PASS — gates green (621/621, coverage ≥ 80 %). Bug reproduced red at both unit and CLI level and fixed. All five `req~integrity-verify~1` scenarios verified. One advisory wording finding.
