# Design — add-verify-ci

## Approach

One orchestrator, the existing batch core, two YAML files.

```
src/modules/foundation/
  verify.ts     ← EXTEND: seed fallback when the gitignored manifest is missing
  laws.ts       ← EXTEND: mergeSeedLaws() — append missing seed ids only
  ci.ts         ← NEW: fail-on ranking, exit codes 0/1/4, fingerprint
  sarif.ts      ← NEW: VerifyReport → SARIF 2.1.0
  report-md.ts  ← NEW: laws table + skipped <details>; no coverage claims
  scaffold.ts   ← EXTEND: ensureVerifyWorkflow() if-missing; merge seed laws
src/shared/git.ts
                ← EXTEND: mergeBase(), changedFiles()
src/cli/commands/verify.ts
                ← NEW: thin; flags, files, process.exit
action.yml      ← NEW at package root (consumer Action)
.github/workflows/speclaw.yml
                ← NEW dogfood: local dist CLI, not npx of the last release
src/modules/foundation/assets/workflows/speclaw.yml
                ← NEW consumer template (uses: esneiderbravo/speclaw@v1)
```

`law_verify` / `speclaw laws verify` keep delegating to `verifyLaws`. The new
command is the CI surface (formats, exit codes, environment checks). Two
transports stay honest: no new MCP tool — verify-ci is a GitHub Action, not an
agent-invoked tool (activation model: 🟢 AUTO).

### Why not `src/modules/laws/`

The graph-engines change already closed this: a `laws` module that `foundation`
would call from the Stop hook is a cycle. Formatters live next to `verify.ts`.

### Why not unify `check` and `verify`

`speclaw check --hook-payload` is a shipped hook contract (exit 2 = deny).
Merging it into `verify` would break installed settings. Action-time stays
`path`-only on the 15 ms budget; batch stays `deps`/`graph`.

### Manifest: seed fallback + merge-by-id

`.speclaw/laws-manifest.json` is gitignored. A CI clone has none, so today's
`verifyLaws` returns an empty pass. Fallback to `seedManifest()` in memory
makes a clean clone evaluate the shipped laws. `scaffold` on `update` appends
any seed id the project does not already have, so brownfield repos gain the
new `deps`/`graph` laws without losing curated entries.

The two `deps` seed laws set `edgeKinds: ["import"]`. Compass currently
resolves only `call` edges by global name, so `JSON.parse` in `src/shared`
would otherwise be reported as a dependency on `compass/parser.ts`'s `parse`.
Import-only evaluation is honest: unresolved imports become `unknown`, never a
false-positive fail. The `graph` cycle law still evaluates the resolved call
graph and is what this repository's dogfood workflow gates on today.

### Two workflows, not one

The published Action runs `npx @esneiderbravo/speclaw@<ver> index && verify`.
This repository must verify the PR's own build, so its workflow is
`npm ci && npm run build && node dist/cli/index.js …`. `scaffold` never
overwrites an existing `.github/workflows/speclaw.yml`, so this repo's
dogfood file is safe.

### Shallow clones

`actions/checkout` defaults to `fetch-depth: 1`. `--ci` plus `isShallowRepo()`
exits `3` with the exact YAML to add. A green check from an empty diff is
forbidden even though this slice does not yet consume `changedFiles` for a
spec-conformance gate — the helper is in place for that later slice.

### Exit codes (frozen)

| Code | Meaning |
| :-- | :-- |
| 0 | No finding at or above `--fail-on` (default `error`) |
| 1 | At least one such finding |
| 2 | Usage (bad flag / incompatible args) |
| 3 | Environment (shallow clone under `--ci`, unwritable `--sarif` path) |
| 4 | `skipped.length > 0` and `--strict-engines` |

`--strict-engines` is the Action default. Unimplemented backends (`ast`, …)
stay inert in `verifyLaws` (existing spec); they do not inflate `skipped`.

## Alternatives weighed

1. **Bot comment in this slice.** Rejected: needs `pull-requests: write` (fork
   PRs) and a third-party action. `$GITHUB_STEP_SUMMARY` is the report.
2. **One YAML for dogfood and consumers.** Rejected: `npx` of `@latest` tests
   the last release, not the PR.
3. **Overwrite existing manifests with the new seed.** Rejected: destroys
   curated laws. Merge-by-id is the additive counterpart of "never overwrite
   personalized files".
