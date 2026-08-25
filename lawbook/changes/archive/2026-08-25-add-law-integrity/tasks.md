# Tasks — add-law-integrity

- [x] Step 0: Create the feature branch `feat/law-integrity` (must be first).
- [x] Add `lock.ts`: canonicalize (CRLF→LF, strip provenance, trim EOL), digest, root, read/write `speclaw.lock` at repo root (never `.speclaw/`).
- [x] Add `scan.ts`: Unicode normalize + injection detectors; scan skills/packs (frontmatter↔body correlation); configurable suppressions with required note.
- [x] Add `integrity.ts` as `verifyIntegrity` (do not overload `verifyLaws`): strict vs advisory vs scan-only policies; symlink targets; missing lock = soft guidance exit 0.
- [x] Wire into `speclaw verify` (SARIF/exit codes) and CLI `speclaw laws lock|accept|scan`; `accept` interactive TTY only — **no MCP tool that mutates the lock**.
- [x] Refresh lock from init/update/`compileLaws`/install writes; emit provenance data-only HTML blocks excluded from digests.
- [x] Doctor: root fast-path, transitive external `@import` (≤4 hops), outside-pipeline listing.
- [x] Dogfood: commit `speclaw.lock` for speclaw itself; CI runs integrity verify; unit + integration tests (lock/scan/integrity/accept + tool-surface assertion).
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
