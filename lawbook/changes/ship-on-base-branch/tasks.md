# Tasks — ship-on-base-branch

- [x] Step 0: Create the feature branch `fix/ship-on-base-branch`.
- [x] Record the commit in the ship marker and continue a base-branch change only while HEAD is unchanged.
- [x] Report unrecorded base-branch work from `shipOnStop` instead of skipping it.
- [x] Block the stop once with `unrecordedReason`, never loop, always tell the user.
- [x] Make the generated AGENTS.md workflow section branch-agnostic.
- [x] Review and update the affected tests (ship integration suite, CLI e2e).
- [x] Run the quality gates (`npm run check`, `npm run build && npm test`).
- [x] Manual verification: run the built `ship-on-stop` against a trunk repository.
- [x] Produce the discipline reports under `reports/`.
- [x] Update the technical documentation (the `ship` spec, the generated workflow block).
- [ ] Archive the change within the same PR after review.
