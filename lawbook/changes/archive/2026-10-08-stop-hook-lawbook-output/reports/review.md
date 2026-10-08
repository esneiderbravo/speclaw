# Review — stop-hook-lawbook-output

Verdict: **PASS**

Branch `fix/stop-hook-lawbook-output` · reviewed diff 972cc55..6e334c0 against proposal.md.

## Blocking findings

None.

## Non-blocking notes

1. `src/modules/lawbook/ship.ts:66` `OWN_OUTPUT` now hides hand-edited `lawbook/specs/**` and `lawbook/anchors/**` from the Stop hook. If an agent hand-edits a canonical spec, ship will not trigger, size, or re-run on it. That is acceptable: these files hold specs and docs, not code, so the hook's gates (build/test/check) cannot check them anyway. Spec edits are meant to go through delta specs under `lawbook/changes/`, which were already excluded. A spec-only branch now gets nothing from ship, the same as a changes-only branch did before. Consider recording this in the new "The lawbook's own output is not work" requirement.
2. The call sites agree. `branchFiles` (:216), `untrackedFiles` (:250), `commitSummary` (:345), `workFingerprint` (:1036) and the `docHint` quick filter (:846) all use one list. `workFingerprint` also hashes `untrackedFiles`, so tracked and untracked files are filtered the same way.
3. `:(exclude)lawbook/specs` (:73) is a valid git pathspec. Removing the trailing slash keeps it a prefix exclude that matches the whole directory, the same form as the old literals.
4. The `docHint` quick filter (:846) matches `" <dir>"` anywhere in a porcelain line. A rename such as `R src/x -> lawbook/specs/y` gets dropped as a whole. Minor: this only affects the quick change-detection hash.
5. `package.json`: `pretest:ci` repeats `pretest`, so `npm run test:ci` still compiles the tests first. `ci.yml:63` and `publish.yml:43` run `test:ci`, so the 80% coverage floor is still enforced. `publish-workflow.test.ts` asserts the new command. The two prep commands are duplicated. Optionally use `"pretest:ci": "npm run pretest"`.
6. `src/modules/compass/affected.ts:378,436-460` resolves `npm test` and only strips coverage and concurrency flags from the script. The simpler script parses as a subset of the old one, so affected-test planning is unaffected. `ship.ts:140` (detectGates) still runs `npm test`, which is now the fast parallel run. That is intended: the coverage floor is CI's job.
7. Test `test/integration/ship.test.ts:157`: it ships once, then writes untracked files under `lawbook/specs/` and `lawbook/anchors/`, and asserts `unchanged-since-last-ship`. Before this change those paths were in the fingerprint and would have re-triggered ship, so the test does pin the regression. Gap: it covers only untracked files, not committed archive output (the merge-base diff path in `workFingerprint`). The shared exclude list covers that case, but a commit step would make the test match the real post-archive flow.
