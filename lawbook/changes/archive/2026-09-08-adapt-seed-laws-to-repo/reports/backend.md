# backend — adapt-seed-laws-to-repo

## What was tested

Catalog adapter (`seed-laws.ts`), merge/prune (`mergeSeedLaws` / `ensureLawManifest` / `mergeLawSources`), graph scope (`runGraphLaw`), and the unit/integration suites that pin those contracts.

## Commands

```
npm run check
npm run build
npm test
node dist/cli/index.js laws compile
node --input-type=module -e '… seedManifestFor(empty|apps|speclaw) …'
```

## Results

| Check | Result |
| --- | --- |
| Prettier + ESLint | pass |
| `tsc` + copy-assets | pass (`copy-assets: copied assets for 3 module(s)`) |
| `npm test` | **513 pass / 0 fail** · coverage lines 85.91 / functions 81.27 / branches 85.78 (floor 80) |
| `seedManifestFor` empty tmp dir | only `law~no-secrets-in-repo~1` |
| `seedManifestFor` `apps/backend/src` | secrets + cycle law scoped to `apps/*/src/**` with test exclusions and `edgeKinds: ["import"]`; no compass/foundation/ATTRIBUTION laws |
| `seedManifestFor` this repo | dogfood laws remain; cycle scope `src/modules/**` plus test exclusions |
| Graph unit | in-scope cycle still reported; `src/shared` cycle ignored when scope is `src/modules/**`; spec files excluded by `!**/*.spec.ts` produce no finding |

`laws compile` in this repo rewrote the AGENTS.md cycle-law block to list the test exclusions and refreshed `speclaw.lock` digests. Two local `ai-specs/rules/law-no-module-cycles-1.*` files are root-owned and could not be rewritten (`EACCES`); they are gitignored regenerable output.

## Covers

- `req~adapt-seed-to-repo~1` — `seedManifestFor`, `adaptedLaws`, `mergeLawSources`
- `req~graph-honours-scope~1` — `runGraphLaw`
