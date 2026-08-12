# Backend checks — add-git-history-layer (2026-08-12)

Date: 2026-08-12 · Branch: `feat/git-history-layer` · Environment: local macOS,
Node v24.17.0, cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ "All matched files use Prettier code style!" + ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` strict clean; "copy-assets: copied assets for 3 module(s)" |
| Tests + coverage | `npm test` | ✅ `tests 150 · pass 150 · fail 0`; coverage all-files line 98.10% / branch 91.12% / funcs 97.30% (floor 80%) |

New-code coverage (from the same run): `src/shared/git-history.ts` — line
100.00% / branch 82.54% / funcs 90.91%; `src/modules/compass/git-history-cache.ts`
— line 100.00% / branch 92.31% / funcs 88.89%. All above the 80% floor.

## Tests added / updated

- `test/helpers/git.ts` — new shared helper: `gitInit`, `commit` (writes+stages+
  commits with a fixed `-c user.*` identity so ephemeral repos need no global
  git config), `head`. Used by every git-history test.
- `test/unit/git-history.log.test.ts` — `logForPath`: history newest-first with
  churn/timestamps; `[]` for a nonexistent path; **revision-range** `since`
  (exclusive, deterministic — replaced an earlier date-based assertion that git
  treated as a soft filter); `[]` outside a repo.
- `test/unit/git-history.churn.test.ts` — summed per-file counts; a binary file
  counted once with no `NaN`; empty outside a repo.
- `test/unit/git-history.coupling.test.ts` — co-change pair count; `minSupport`
  filtering; empty outside a repo.
- `test/unit/git-history.lasttouch.test.ts` — SHA of the last touch (unaffected
  by a later unrelated commit); `null` for no history; `headSha` before/after a
  first commit.
- `test/unit/git-history.shallow.test.ts` — full clone → `shallow: false`;
  real `git clone --depth=1` (via `file://`) → `shallow: true` on both scans.
- `test/unit/git-history.edge.test.ts` — spaced **and** unicode paths reported
  whole (drove the `core.quotePath=false` fix); no-commit repo empty everywhere.
- `test/integration/git-history-cache.test.ts` — cache hit at same HEAD (proven
  by tampering the stored payload and seeing it returned); recompute after a new
  commit; co-change caching; table dropped+rebuilt empty on a schema reset.

TDD evidence: the unicode-path and `since` assertions **failed before** the
`core.quotePath=false` and revision-range fixes and pass after (see the two
failures captured mid-build, then green).

## Spec-scenario coverage

| Scenario (delta spec) | Verified by |
| :-- | :-- |
| Per-file change history · A path with history | `git-history.log.test.ts` "returns a path's commits newest-first" |
| Per-file change history · A path with no history | `git-history.log.test.ts` "returns [] for a path that never existed" |
| Per-file change history · A bounded revision range | `git-history.log.test.ts` "honors a since revision bound (exclusive)" |
| Change frequency · Summed change counts | `git-history.churn.test.ts` "sums per-file change counts" |
| Change frequency · Binary files do not corrupt the sum | `git-history.churn.test.ts` "counts a binary file's change without NaN" |
| Co-change coupling · Files that change together | `git-history.coupling.test.ts` "counts commits that touch a pair" |
| Co-change coupling · Minimum support filters weak pairs | `git-history.coupling.test.ts` "omits pairs below minSupport" |
| Last touch · Path with history | `git-history.lasttouch.test.ts` "returns the SHA of the most recent commit" |
| Last touch · Path with no history | `git-history.lasttouch.test.ts` "returns null for a path with no history" |
| Shallow-clone detection · A shallow clone is flagged | `git-history.shallow.test.ts` "--depth=1 clone is flagged" |
| Shallow-clone detection · A full clone is not flagged | `git-history.shallow.test.ts` "full clone is not flagged" |
| Robust parsing · A path containing a space | `git-history.edge.test.ts` "paths with spaces and unicode are reported whole" (+ manual run) |
| No user-facing surface · Transports are unchanged | No `register.ts`/CLI touched; `npm test` contract + e2e suites unchanged and green |

(The cache scenarios are covered in `database.md`.)

## Pre-existing / unrelated failures

None. The full suite is green; no test outside this change was modified.

## Pending manual steps

None outstanding. Manual verification was executed by the agent: the built
engine + cache were driven against a throwaway repo in `os.tmpdir()` (created,
exercised, and removed — never the real repo, per Rule 6), confirming
`headSha`, `logForPath` (incl. `since` range), `churn` (incl. unicode + binary),
`coChanges`, `lastTouch`, and cache invalidation on a new commit.

## Verdict

✅ The shared git-history engine and its compass-side cache are implemented,
fully covered, and behave per the delta spec; all gates green.
