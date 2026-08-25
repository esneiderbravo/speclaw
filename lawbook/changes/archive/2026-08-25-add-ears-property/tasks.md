# Tasks — add-ears-property

- [x] Step 0: Create the feature branch `feat/ears-property` (must be first).
- [x] Add `ears.ts`: classify five EARS molds + complex/unstructured; stable diagnostic codes; deterministic `suggest` rewrite (never write files).
- [x] Extend `spec-items` / coverage config: parse optional `Verification:`; treat `Needs: ptest` as SoT; `Verification: property` expands effective needs to include `ptest`; load `ears.severity`, vague list, `propertyRunners` from `lawbook/config.yaml`.
- [x] Wire EARS into `specValidate`: issues vs warnings per severity; speclaw config `ears.severity: strict`; scaffold default strict.
- [x] Coverage: artifact type `ptest`; detect recognized runners in a small window after `Covers:`; missing `ptest` is a direct defect; archive gate inherits via `coverageArchiveBlockers`.
- [x] Add fast-check + unit fixtures for classifier; one real property test covering the parser (`// Covers:` on an identified ears requirement).
- [x] Dogfood: rewrite speclaw `lawbook/specs/**` into valid EARS molds; add `Needs: ptest` only where universal quantification warrants it; keep coverage links healthy.
- [x] CLI/docs: validate/coverage messaging for EARS + ptest; update `docs/standards/lawbook.md` / operator notes; **no new MCP tool**.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
