# Proposal — stop-hook-cost

## Why

In a monorepo session the `Stop` hook cost more than the work. Its test gate replaced `npm test` with an affected-test selection that also picked a Playwright e2e workspace the project's `test` script never runs: it drove the live dev stack at every stop (~160 s), and a run cut by the 600 s hook timeout skipped its teardown and left seeded data in the developer's database. Excluding those tests through `.speclaw/affected.json` did not help until `index --force`, because files skipped by stat kept their old test flag. And a long session re-ran every gate at almost every stop. Issues #81, #82, #83.

## What changes

- The scoped test gate never reaches a package the root `scripts.test` does not run, when that script names its packages.
- A `testGlobs` change re-flags every indexed file at the next index run or per-file reindex.
- `ship.cooldownMinutes` (off by default) lets a project space re-ships after a passing one.

## Impact

`src/modules/compass/{affected,indexer,db}.ts`, `src/modules/lawbook/ship.ts`; docs (`docs/cortex.md`, CHANGELOG). Default behavior is unchanged except where the selection exceeded the test script. No migration: the stored globs key is written at the next run; an index without it is re-flagged once.
