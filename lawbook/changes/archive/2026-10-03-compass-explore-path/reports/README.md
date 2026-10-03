# Reports — compass-explore-path

Bug reports MUST include the regression test **failing before the fix**.

Expected reports:

- `backend.md` — tester. Query logic in `src/modules/compass/query.ts`, the integration regression in `test/integration/compass.test.ts` (red before the fix, green after), and the 2.0.2 → 2.0.3 version bump.
- `api.md` — tester. Public `compass_explore` / `speclaw explore` and search fallback contract: path resolution, unchanged symbol-name explore, and the `alph` → `alpha` fuzzy fallback.
- `review.md` — reviewer. Harness verdict PASS or FAIL.
