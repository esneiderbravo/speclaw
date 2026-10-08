# Backend checks — compass-map-not-work (2026-10-08)

2026-10-08 · `fix/doc-hint-background` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Format + lint | `npm run check` | ✅ exit 0 |
| Type-check + build | `npm run build` | ✅ exit 0 |
| Tests | `npm test` | ✅ 1045 tests, 1045 passed; lines 89.34 % |

## Tests added / updated

`test/integration/ship.test.ts`: "a regenerated Compass map is not work: the hook archives nothing on a fresh branch".

## Regression test failing first

Before the fix: `not ok 1 — a regenerated Compass map is not work …` (the hook shipped the map-only change). After: `ok 1`.
Review notes (fingerprint file list, CRLF): with only those two edits reverted the extended test fails (`# fail 1`); with them it passes.

## Spec scenario coverage

| Scenario | Verified by |
|----------|-------------|
| A session start on a fresh branch ships nothing | the test above (`{ skipped: "no-changes" }`, no change dir) |
| An edit outside the block is work | same test, second half |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Reproduced from the ftd-admin-finanzas session log; verified on a throwaway git fixture.

## Verdict

✅ PASS — a regenerated map no longer ships an empty change.
