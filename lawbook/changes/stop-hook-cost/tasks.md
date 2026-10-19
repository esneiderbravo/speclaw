# Tasks — stop-hook-cost

- [x] Step 0: branch `fix/stop-hook-cost` from `main`.
- [x] Scope the test gate to the packages the root test script runs (`testScriptPackages`, `scopedTestGate`).
- [x] Re-flag test files when `testGlobs` change (`syncTestFlags` in `buildIndex` and `indexFiles`, `meta.test_globs`).
- [x] Add `ship.cooldownMinutes` and the `cooling-down` skip (marker `at`).
- [x] Tests: unit `test-script-packages`, unit `index-files` glob change (fails before the fix), integration `ship` (gate stays in the test script — fails before the fix; cooldown on and off).
- [x] Gates: `npm run check`, `npm run build`, `npm test` (1104 passed).
- [x] Manual verification: `testScriptPackages` on a real monorepo whose `npm test` runs `api` and `web` returns `apps/backend`, `apps/web` — its e2e workspace is out.
- [x] Docs: `docs/cortex.md`, CHANGELOG.
