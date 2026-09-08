# Design — adapting the seed catalog to a target repo

Level 2 does not require this file; it exists because prune vs. keep is a
policy choice, not an implementation detail.

## Catalog vs. project manifest

The shipped JSON remains the **catalog** (all laws, plus adapter metadata
`requires` / `adaptScope`). The project file at `.speclaw/laws-manifest.json`
stays a `Law[]` — adapter fields are stripped before write. `seedManifest()`
still returns the full catalog as laws (tests and dogfood assertions). Every
runtime consumer (`ensureLawManifest`, `mergeSeedLaws`, `mergeLawSources`,
`loadManifestForVerify`) uses `seedManifestFor(projectPath)`.

## Applicability

A catalog law is applicable when every `requires` path exists (file, directory,
or glob with `*`). Empty `requires` means portable — today only
`law~no-secrets-in-repo~1`.

`law~no-module-cycles~1` uses `adaptScope: "source-roots"`:

1. If any positive catalog glob is satisfied, keep those positives.
2. Else use detected roots: `apps/*/src/**`, `packages/*/src/**`, `src/**`,
   `lib/**` (only those that exist).
3. If nothing remains, omit the law.
4. Always append test negations (`*.spec.*` / `*.test.*` / `test/` /
   `__tests__/`) and `edgeKinds: ["import"]`.

## Merge / prune on update

For each shipped catalog id:

| Existing entry | Adapted law | Action |
| --- | --- | --- |
| missing | present | append adapted |
| equals raw catalog | present and different | replace with adapted (scope rewrite) |
| customized (≠ raw) | present | keep existing |
| equals raw catalog | absent | remove |
| customized | absent | keep existing |

"Equals raw catalog" compares `id`, `scope`, `prose`, and `verification`.
Title/rationale/enforcement/source follow the same snapshot so a one-word
prose edit counts as curated.

## Graph scope

`runGraphLaw` already accepts a CLI `paths` prefix filter. It additionally
drops any file that fails `matchesScope(law.scope, file)`. Empty scope remains
"whole graph" so existing unit fixtures stay valid.
