# Tasks — lock-regenerable-symlink

- [x] Step 0: Create the feature branch (must be first). Confirm branch `fix/lock-regenerable-symlink`.
- [x] Add regression tests (red before, green after) in `test/unit/integrity.test.ts`: refreshing the lock with `.claude/rules/speclaw` present writes `symlinks: {}`; a legacy lock pinning `.claude/rules/speclaw` with the link missing or retargeted is `ok: true` with a `warn` finding. Record the failing-before output in `reports/backend.md`.
- [x] Implement the fix in `src/modules/foundation/lock.ts` and `src/modules/foundation/integrity.ts`: `isRegenerableIdeMirror` covers `.claude/rules/speclaw`; `snapshotLockEntries` skips regenerable mirror symlinks; `verifyIntegrity` warns (does not fail) for a missing or retargeted regenerable mirror symlink entry. Lock format unchanged.
- [x] Review and update the affected tests. Non-mirror managed symlinks (hand-written lock entries) still fail when missing or retargeted, and a matching one reports `ok`.
- [x] Complete prevention §7: delta on `req~integrity-verify~1` in `specs/law-enforcement/spec.md` (full copy of the canonical spec; sync overwrites the whole file).
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md): `npm run check`, `npm run build`, `npm test`.
- [x] Perform manual verification of the behavior — the tester role executes this itself, never the user. In a scratch project: create the `.claude/rules/speclaw` link, run `speclaw laws lock` (lock has `"symlinks": {}`); hand-pin the entry, delete the link, run `speclaw verify` (exit 0 with a warning).
- [x] Produce the discipline reports under reports/ — one per discipline touched (`backend.md`, plus `cli.md` for the `speclaw verify` exit-code change; no API surface touched) — with the unit/integration/e2e results for what the change touched, including the regression failing before the fix.
- [x] Update the technical documentation touched by the change. `CHANGELOG.md` `[2.0.5]` → Fixed (version bumped to 2.0.5 so the publish workflow releases it). No docs/*.md describe lock symlink pinning.
- [x] Archive the change within the same PR (lawbook:archive) after harness review/test PASS.
