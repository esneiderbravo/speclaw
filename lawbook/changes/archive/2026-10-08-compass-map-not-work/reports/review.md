# Review: compass-map-not-work

Verdict: **PASS**

Scope: the map-fix diff (`src/shared/compass-map.ts`, `src/modules/lawbook/ship.ts`,
`src/modules/foundation/lock.ts`, `test/integration/ship.test.ts`) against the requirement
"A regenerated Compass map is not work" and `proposal.md`.

## Checklist
- **Hidden real edits:** none. Missing markers make `stripCompassMapBlock` a no-op, so any edit counts. A missing base copy (`git show` fails, so `git()` returns `""`) is caught by `then !== ""`, and no merge base returns false. In both cases the file counts as work. `git()` (ship.ts:831) does not trim, so the base and disk texts compare byte for byte. If the agent deletes the markers, the result is a mismatch and the file counts as work.
- **Fingerprint and branchFiles:** consistent. `workFingerprint` (ship.ts:885) hashes the stripped body, so re-indexes do not change it. There is no reship loop, and an edit outside the block still changes the hash.
- **Boundaries:** `lawbook/ship.ts` imports only `shared/compass-map.js`. `shared/compass-map.ts` has no imports. `foundation/lock.ts` re-exports `COMPASS_MAP_START`, `COMPASS_MAP_END` and `stripCompassMapBlock`, so its existing importers keep working.
- **Test:** `gitFixture` is a throwaway repo. It covers both scenarios: a map-only rewrite returns `no-changes` and creates no change dir, and an edit outside the block ships.

## Blocking findings
None.

## Non-blocking
1. ship.ts:899-901: when `docs/compass.md` differs only in the map, its *name* still enters the fingerprint, because the tracked list is not filtered like `branchFiles`. On a branch that already has real work, the first session re-index can cause one redundant ship and gate run. It does not loop. The spec says "left out of the work fingerprint", so a follow-up could apply the `onlyMapChanged` filter here too.
2. ship.ts `onlyMapChanged`: the disk copy is compared with the raw blob. With `core.autocrlf` (Windows), CRLF line endings never match, so a map-only change still counts as work. This fails safe: nothing is hidden, but the original bug remains there. Normalising `\r\n` on both sides would fix it.
3. By design, edits the agent makes *inside* the map block are invisible to ship. That is acceptable because the block is generated, but it is worth a line in `docs/compass.md`.
