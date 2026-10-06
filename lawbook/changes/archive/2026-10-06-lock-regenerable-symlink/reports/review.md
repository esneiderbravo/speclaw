# Review: lock-regenerable-symlink

**Role:** reviewer · **Change:** lock-regenerable-symlink (bug, level 1) · **Date:** 2026-10-06 ·
**Branch:** fix/lock-regenerable-symlink (uncommitted working tree) · **cwd:** /Users/esneiderbravo/Projects/speclaw

## Verdict: PASS

The fix matches `bugfix.md` §5. `snapshotLockEntries` no longer pins the
gitignored `.claude/rules/speclaw` link. `verifyIntegrity` downgrades legacy
mirror-symlink entries that are missing or retargeted to `warn`, and non-mirror
managed symlinks keep the strict `error`. The delta spec touches only
`req~integrity-verify~1`. Red-before-green evidence is recorded. Nothing below
blocks the change.

## Scope reviewed

- `src/modules/foundation/lock.ts`: `isRegenerableIdeMirror`, `integrityPolicy`, `snapshotLockEntries`, `refreshLockfile`, `discoverIntegrityPaths`
- `src/modules/foundation/integrity.ts`: `verifyIntegrity` (symlink loop, file-missing branch), `acceptLockPath`
- `test/unit/integrity.test.ts` (3 regression tests + 3 non-mirror symlink tests)
- `CHANGELOG.md` `## [2.0.5]`, `package.json` / `package-lock.json` at 2.0.5
- `specs/law-enforcement/spec.md` delta vs `lawbook/specs/law-enforcement/spec.md`
- Callers via Compass: `refreshLockfile` ← `scaffold`, `compileLaws`, `runLaws` (laws lock); `verifyIntegrity` ← `runVerify`, `runLaws` (laws scan); `integrityPolicy` ← `verifyIntegrity`, `acceptLockPath`, `snapshotLockEntries`; `isRegenerableIdeMirror` ← `verifyIntegrity`, `snapshotLockEntries`; doctor uses only `discoverIntegrityPaths` / `readLockfile` / `rootDigest`.

## Findings

### F1. No remaining path writes the mirror symlink into the lock (OK)
- `refreshLockfile` builds `symlinks` only from `snapshotLockEntries`, which now skips `isRegenerableIdeMirror(s.path)` (`lock.ts` ~L334-338). It does not carry `prev.symlinks` forward. The only things it copies from the previous lock are the `accepted` entries.
- `scaffold` (update/init), `compileLaws` and `speclaw laws lock` all go through `refreshLockfile`, so they are all covered.
- `acceptLockPath` (`integrity.ts`) does not add symlinks. It leaves the existing `lock.symlinks` unchanged, so it keeps a legacy entry if one is there. That is harmless: the entry only warns, and the next refresh drops it.

### F2. `integrityPolicy` and `.claude/rules/speclaw` (safe)
- The current `integrityPolicy` does not put `.claude/rules/speclaw` in the strict list. The comment says mirrors fall through to `scan-only`. I had no shell, so I could not read the pre-change body from `git diff`. The analysis below holds whichever version came before.
- Callers only pass discovered **files**. `discoverIntegrityPaths` never returns the link as a file: `walkFiles` skips symlink dirents, and `.claude/rules` is never walked. So `snapshotLockEntries` and the "untracked" loop in `verifyIntegrity` behave the same as before.
- `acceptLockPath(".claude/rules/speclaw…")` now hits the clean `scan-only` rejection. Under a strict policy it would have digested a directory link (EISDIR) or pinned a gitignored mirror. This is an improvement, not a regression.

### F3. Broadening `isRegenerableIdeMirror` to `.claude/rules/speclaw/**` (safe)
- It is used in only three places:
  - the file-missing branch of `verifyIntegrity`, which now warns instead of erroring;
  - the symlink loop of `verifyIntegrity`;
  - the symlink filter in `snapshotLockEntries`.
- Doctor `integrityChecks` does not call it, so doctor output is unchanged.
- Files under `.claude/rules/speclaw/` resolve into gitignored `ai-specs/rules`, which the existing `ai-specs/` prefix already treats as regenerable. Real refreshes never pin them. Only hand-written lock entries could reach the new warn path, and that is the intended behaviour.

### F4. One-time lock diff for consumers with a legacy entry (acceptable, note it)
- In a consumer repo whose committed `speclaw.lock` pins `.claude/rules/speclaw`, the next `speclaw update`, `laws compile` or `laws lock` rewrites `symlinks` to `{}`. That is a single diff, and the lock then stays stable on every machine. Until it is committed, `verify` on clean clones only warns.
- The same refresh also bumps `generator` to `@esneiderbravo/speclaw@2.0.5`, so consumers get a one-time lock diff on upgrade anyway.
- Optional nit: the CHANGELOG `### Fixed` entry could say explicitly that the next `speclaw update` / `laws lock` drops legacy entries. The warn message in `integrity.ts` already gives this remedy.

### F5. Bug gate: red-before-green (satisfied for red)
- `reports/backend.md` records a run on HEAD `cad8da0` with only the test file changed: `tests 21 · pass 18 · fail 3`. The three regression tests fail with the expected assertions: the lock pinned the link, and `r.ok` was `false` for both the missing and the retargeted link.
- The non-mirror symlink tests pass before and after the fix, which shows strict behaviour is preserved.
- The tester still has to add the gates table, the green run, scenario coverage and the verdict (tasks 8-10 are open, as expected at this stage).

### F6. Delta spec (correct, minimal)
- The canonical spec has 956 lines and the delta has 977 (+21). Lines 1-870 line up, `### Requirement: … req~integrity-verify~1` sits at L871 in both, and the rest of the file is shifted only by the insertion.
- The +21 lines are:
  - a 5-line extension of the requirement body: refreshes do not pin the mirror symlink, and a missing or retargeted legacy entry warns;
  - two new scenarios (16 lines): "Regenerable mirror symlink is not pinned and its absence does not fail verify" and "Missing non-mirror managed symlink fails verify".
- `lawbook_change validate` reports `valid: true`, with no issues. The EARS warnings are pre-existing and apply to the whole spec.
- Every scenario maps to a unit test in `test/unit/integrity.test.ts`:
  - "refreshing the lock does not pin…"
  - "legacy lock pinning a missing…"
  - "legacy lock pinning a retargeted…"
  - "missing non-mirror managed symlink fails"
  - "non-mirror symlink retarget fails integrity"

### F7. Standards
- **backend-standards / base:** the change is small and local. Comments explain why the constraint exists (gitignored link, clean clones), not what the ticket was. The lock format is unchanged.
- **documentation.md:**
  - `isRegenerableIdeMirror` gains full TSDoc with `@param` and `@returns`.
  - The `snapshotLockEntries` and `verifyIntegrity` TSDoc is updated with the new contract. It is prose-only, which matches the existing style of those symbols.
- **testing-standards:** `node:test` regression coverage was added. The tester still has to run and report the gates (`npm run check`, `npm run build`, `npm test`) and the manual scratch-project check.

### F8. Nits (non-blocking)
1. `tasks.md` L11 says "`CHANGELOG.md` [Unreleased] → Fixed", but the entry is under `## [2.0.5]` (correct for the publish workflow). The task text should be reworded to match.
2. After this fix, the only symlink `discoverIntegrityPaths` probes is `.claude/rules/speclaw`, and that one is always filtered out. So refreshes never record any symlink, and strict symlink checks only apply to hand-written lock entries. This is fine for now. A future cleanup could drop the probe, or document that managed symlinks other than the mirror must be pinned by hand.
3. The `## [2.0.5]` section also carries the `### Changed` publish-workflow entry from #51. That is correct, because it was unreleased; just confirm it is intended for this release.

## Rework guidance

None required.
