# Tasks — compass-map-not-work

- [x] 1.1 Move the map-block helpers to `shared/compass-map.ts`, re-exported from `foundation/lock.ts`
- [x] 1.2 Leave a map-only `docs/compass.md` change out of the branch diff and the fingerprint
- [x] 1.3 Review notes: the map-only file stays out of the fingerprint's file list; CRLF on disk compares as LF
- [x] 2.1 Regression test (red before the fix): a fresh branch with a regenerated map ships nothing; an edit outside the block ships
- [x] 2.2 Gates: check, build, test (1045/1045)
