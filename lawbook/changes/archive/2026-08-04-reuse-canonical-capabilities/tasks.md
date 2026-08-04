# Tasks — reuse-canonical-capabilities

- [x] Step 0: Create the feature branch `feat/reuse-canonical-capabilities` (must be first).

## Engine

- [x] Add private helpers to `src/modules/lawbook/engine.ts`: `canonicalCapabilities`, `requirementHeaders`, and a local Levenshtein/edit-distance for near-match.
- [x] Add `warnings: string[]` to `ValidationResult`; populate near-duplicate and dropped-requirement warnings in `specValidate`; keep `valid` driven by `issues` only.
- [x] Add `created: string[]` / `updated: string[]` to `SyncResult` (and surface in `ArchiveResult`), split by `fs.existsSync(dest)` before the copy; keep `promoted: string[]` intact. Leave the `copyFileSync` mechanic unchanged.

## CLI & tool wiring

- [x] Update `src/cli/commands/lawbook.ts`: print validate warnings under a distinct heading (still valid with only warnings); annotate sync/archive output with created/updated.
- [x] Update `lawbook_validate` and `lawbook_sync` tool descriptions in `src/modules/lawbook/register.ts` to mention advisory warnings and the created/updated distinction.

## Skills (packaged source + self-install)

- [x] Edit `src/modules/lawbook/assets/skills/draft/SKILL.md`: refresh the index for freshness; list canonical capabilities and reuse exact names; start an existing-capability delta from the current canonical content.
- [x] Edit `src/modules/lawbook/assets/skills/explore/SKILL.md`: refresh the index for freshness before investigating.
- [x] Edit `src/modules/lawbook/assets/skills/sync/SKILL.md`: note the created-vs-updated promotion report.
- [x] Refresh speclaw's own `ai-specs/skills/` copies so the repo dogfoods the update.

## Tests

- [x] Review and update the affected tests: added `node:test` coverage for `specValidate` warnings (near-duplicate name, dropped requirement, clean case) and for `specSync` created-vs-updated status, under `test/unit/`. Existing tests unchanged (additive `SyncResult`).

## Gates & verification

- [x] Run the quality gates and verify they pass: `npm run check` ✅, `npm run build` ✅, `npm run test` ✅ (124/124, engine 99.46% lines).
- [x] Perform manual verification of the behavior — the agent executed it in a `mktemp -d` scratch repo: `lawbook validate` (near-duplicate + dropped-requirement warnings) and `lawbook sync` (created/updated report). No writes to real lawbook data; temp dir removed.
- [x] Produce the discipline reports under `reports/` (`backend.md`).
- [x] Update the technical documentation touched by the change: the workflow is documented in the skill assets (updated); there is no `docs/lawbook.md`, and `docs/compass.md`'s `compass_index` description remains accurate.

## Archive

- [x] Archive the change within the same PR (`lawbook:archive`).
