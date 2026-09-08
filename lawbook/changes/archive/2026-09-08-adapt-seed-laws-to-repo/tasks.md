# Tasks — adapt-seed-laws-to-repo

- [x] Step 0: Create the feature branch `feat/adapt-seed-laws-to-repo` (must be first).
- [x] Catalog: add `requires` / `adaptScope` on shipped laws; cycle law gets `edgeKinds: ["import"]`.
- [x] `seedManifestFor(projectPath)`: filter by `requires`, rewrite cycle-law scope from detected source roots, append test exclusions; strip adapter fields before persist.
- [x] `mergeSeedLaws` / `ensureLawManifest` / `mergeLawSources` / `loadManifestForVerify` consume the adapted seed; prune unmodified inapplicable catalog laws; rewrite unmodified cycle-law scope.
- [x] `runGraphLaw` restricts the adjacency to `law.scope` (AND the optional `--paths` filter).
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
