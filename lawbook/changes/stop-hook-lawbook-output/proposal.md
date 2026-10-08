# stop-hook-lawbook-output

## Why

After PR #75 was archived, the next stop re-ran every gate (~106 s) and rewrote
the archived report with no code change: the work fingerprint excluded
`lawbook/changes/` but not the canonical specs an archive promotes or the
anchors it seals. The suite itself took ~90 s because `npm test` ran serially
with coverage, a cost the agent's targeted runs and the hook's test gate paid.

## What changes

- One list of the lawbook's own output (`lawbook/changes/`, `lawbook/specs/`,
  `lawbook/anchors/`, `.speclaw/`) drives the branch files, untracked files,
  work fingerprint, commit summary and doc hint.
- `npm test` runs in parallel without coverage (~43 s); the coverage-gated serial
  run is `npm run test:ci`, used by CI and publish.

## Impact

- Capability `ship`: new requirement "The lawbook's own output is not work".
- Modules: `lawbook/ship.ts`; repo tooling: `package.json` scripts, `ci.yml`,
  `publish.yml`, `publish-workflow.test.ts`. No public API change.
