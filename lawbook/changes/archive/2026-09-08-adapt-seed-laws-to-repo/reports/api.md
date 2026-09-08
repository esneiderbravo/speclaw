# api — adapt-seed-laws-to-repo

No new MCP tools or CLI verbs. Init, update, `speclaw laws compile`, and `speclaw verify` / `law_verify` now consume the **adapted** catalog:

- `scaffold` / `ensureLawManifest` writes `seedManifestFor(projectPath)`
- `mergeSeedLaws(existing, projectPath)` prunes unmodified dogfood laws whose paths are absent
- `loadManifestForVerify` falls back to the adapted seed (not the raw catalog)
- `mergeLawSources` (compile) uses the same merge so dialect rules do not re-inject compass/foundation laws

Existing CLI: `speclaw init`, `speclaw update`, `speclaw laws compile`, `speclaw verify`.
