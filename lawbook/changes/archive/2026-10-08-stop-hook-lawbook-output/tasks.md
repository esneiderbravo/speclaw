# Tasks — stop-hook-lawbook-output

- [x] 0.1 Create the branch `fix/stop-hook-lawbook-output`
- [x] 1.1 Unify the lawbook's own output (`OWN_OUTPUT`) and exclude specs and anchors from branch files, untracked files, fingerprint, commit summary and doc hint
- [x] 1.2 Split `npm test` (parallel, no coverage) from `npm run test:ci` (serial, coverage floor); point CI and publish at `test:ci`
- [x] 2.1 Test: archive output is not new work for the Stop hook; update the publish workflow test
- [x] 2.2 Gates: `npm run check`, `npm run build`, `npm test` 1058/1058 in 43 s (was ~90 s)
- [x] 2.3 Archive the change within the same PR
