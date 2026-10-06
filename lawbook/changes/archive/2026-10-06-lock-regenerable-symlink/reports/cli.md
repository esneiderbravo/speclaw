# CLI report — lock-regenerable-symlink

**Discipline:** cli · **Change:** lock-regenerable-symlink · **Date:** 2026-10-06 ·
**Branch:** fix/lock-regenerable-symlink (uncommitted) · **cwd:** /Users/esneiderbravo/Projects/speclaw

Built CLI: `/Users/esneiderbravo/Projects/speclaw/dist/cli/index.js` (2.0.5). Node v24.17.0, macOS arm64.

Isolation: every scenario ran in throwaway git repos under `/tmp`:
- `/tmp/speclaw-t-lock` is the scaffolded origin. It contains `package.json` and `src/a.ts`.
- `/tmp/speclaw-t-clone` and `/tmp/speclaw-t-old` are `git clone`s of the origin, used to simulate CI.

The pre-fix comparison used HEAD `cad8da0`, built in a temporary `git worktree` at `/tmp/speclaw-head`, which was removed afterwards. No real data store was touched.

## Contract delta (`speclaw verify`, `speclaw update`, `speclaw laws lock`)

The `speclaw.lock` format is unchanged: `symlinks` is still a map. What changed:

| Situation | Before (HEAD) | After (branch) |
| --- | --- | --- |
| `update` / `laws lock` with `.claude/rules/speclaw` present | Pins `".claude/rules/speclaw": {"target":"../../ai-specs/rules"}` | `"symlinks": {}` |
| `verify`, lock pins `.claude/rules/speclaw`, link missing | exit **1**, error `Managed symlink missing (expected → …)` | exit **0**, warn `Regenerable IDE mirror symlink missing — run \`speclaw update\` or \`speclaw laws lock\` to drop the stale entry` |
| Same, link retargeted | exit **1**, error `Managed symlink retargeted` | exit **0**, warn `Regenerable IDE mirror symlink retargeted — …` with detail `expected … found …` |
| Same, with `--fail-on warn` | exit 1 | exit 1 (opt-in strictness is kept) |
| `verify`, non-mirror managed symlink missing or retargeted | exit 1 | exit 1 (unchanged) |

## Gates & results

| # | Check | Command (in scratch dir) | Result |
| --- | --- | --- | --- |
| a | Scaffold for Claude | `speclaw init --agents claude --no-index --project-name scratch` | PASS, exit 0. `.claude/rules/speclaw -> ../../ai-specs/rules` exists. `speclaw.lock` has `"symlinks": {}`. `.gitignore` covers `ai-specs/`. `.claude/rules/speclaw` is **not** gitignored by the scaffold, which is by design (see backend.md finding 1). |
| b | Lock stability | `speclaw update` then `speclaw laws lock`, run twice | PASS. All 4 runs exit 0. `laws lock` prints `12 file(s), 0 symlink(s)`. The initial lock and all four snapshots share sha256 `9a27bd17c2632c24…`, so they are byte-identical. The lock has no time-based fields. The link stays present throughout. |
| c | Clean CI clone | `git clone` origin, `rm .claude/rules/speclaw` (no `ai-specs/`), then `speclaw verify --ci` (text and `--format json`) | PASS, exit 0. `failed: 0` and there is no `integrity~symlink~1` finding. With the committed dangling link restored (`git checkout`), the result is also exit 0. |
| d1 | Legacy lock, link missing | hand-pin `".claude/rules/speclaw": {"target":"../../ai-specs/rules"}`, then `speclaw verify --ci` | PASS, exit 0. Output: `0 passed · 0 failed · 1 skipped` and `! integrity~symlink~1 — .claude/rules/speclaw`. The JSON finding has severity `warn` and the "Regenerable IDE mirror symlink missing…" message. `--fail-on warn` gives exit 1. |
| d2 | Legacy lock, link retargeted | `ln -s /tmp/elsewhere .claude/rules/speclaw`, then `speclaw verify --ci --format json` | PASS, exit 0. Finding is `warn` with detail `expected ../../ai-specs/rules found /tmp/elsewhere`. |
| d3 | Update drops legacy entry | `speclaw update` (link absent) | PASS, exit 0. The link is regenerated and `"symlinks": {}`. The lock is byte-identical to the origin lock (`cmp`). A follow-up `verify --ci` exits 0 with no integrity finding. |
| d4 | `laws lock` drops legacy entry | restore legacy lock, link absent, `speclaw laws lock` | PASS, exit 0. Output: `0 symlink(s)`. The lock is byte-identical to the origin lock, with the link still absent. |
| ctrl | Non-mirror strict | hand-pin `tools/managed` → `../shared/other`, with the link at `../shared/managed`, then with it removed; `speclaw verify --ci` | PASS. Retargeted gives exit **1** (`1 failed`, `expected ../shared/other found ../shared/managed`). Missing gives exit **1**. |
| red | Pre-fix reproduction | HEAD build: `speclaw update` in a clone, then `rm` the link, then `speclaw verify --ci` | HEAD pins the link, and verify exits **1** (`1 failed`, `integrity~symlink~1 — .claude/rules/speclaw`). The branch build on that same tree exits **0** with the warning. |

## Tests added / updated

No CLI e2e tests were added. The behavior lives in `verifyIntegrity` and `snapshotLockEntries`, which are covered by `test/unit/integrity.test.ts` (see backend.md). The CLI only maps `ok` to the exit code through the existing `foldIntegrityIntoReport` and `verifyExitCode` path, which this change does not modify.

## Spec-scenario coverage

See backend.md. All five `req~integrity-verify~1` scenarios are mapped there. Rows a–d and ctrl above are the CLI evidence for "Regenerable mirror symlink is not pinned and its absence does not fail verify" and "Missing non-mirror managed symlink fails verify".

## Pre-existing / unrelated failures

None. Every scratch `verify` also prints `law~no-module-cycles~1 — skipped: no-index`, because init ran with `--no-index`. This is skipped rather than failed and does not affect the exit code.

## Pending manual steps

None.

## Verdict

PASS. The `speclaw verify` exit code flips from 1 to 0 only for legacy regenerable-mirror symlink entries, the lock is stable across runs and machines, and non-mirror links stay strict.
