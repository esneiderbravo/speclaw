# adapt-seed-laws-to-repo — seed laws from the target repo, not from speclaw

## Why

`speclaw init` copies this repository's own architecture laws into every
consumer. A Nest/Nx repo whose code lives under `apps/*/src/` then inherits
`src/modules/compass must not import foundation`, `ATTRIBUTION.md`, and a
cycle law scoped to `src/modules/**`. Compile and `update` keep re-injecting
those ids. `verify` falling back to the raw seed on a missing manifest makes
the same mistake in CI.

Meanwhile the graph engine ignores `law.scope`, so `law~no-module-cycles~1`
reports cycles in `shared/` and in specs that merely extend a production base
class (call-graph name hits, not import cycles). Making `speclaw verify`
required would turn those false positives into a permanent merge block.

## What

1. **Adapt the shipped catalog to the target tree** on `init`, `update`,
   compile merge, and verify-fallback: include a seed law only when its
   required paths exist; rewrite the cycle law's scope to detected source
   roots (`apps/*/src/**`, `packages/*/src/**`, `src/**`, …) when the catalog
   default is absent; always exclude test files from that law and set
   `edgeKinds: ["import"]`.
2. **Preserve curation.** Existing entries are never overwritten. Unmodified
   shipped laws whose paths do not exist are pruned; an unmodified cycle law
   whose default paths vanished is replaced by the adapted one.
3. **Graph engine honours scope.** Cycle detection only considers files
   matching the law's globs (and the optional `--paths` filter).

## Non-goals

- Inferring domain layering (hexagonal `from`/`to` rules) from the tree.
- Changing Compass so `extends` is a first-class edge kind.
- Moving `.speclaw/laws-manifest.json` out of the gitignore.
- New MCP tools or CLI verbs.

## Capabilities

- `law-enforcement` — seed catalog, adapt/prune, graph scope, verify fallback
