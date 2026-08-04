# Proposal — add-test-suite-and-ci-gates

## Why

speclaw has no automated tests. `docs/standards/testing-standards.md` says so
outright ("there is **no unit-test runner yet**") and treats the compile-time
gates (`npm run check`, `npm run build`) plus agent-run manual verification as
the only floor. That floor is real but thin: it catches type errors and lint,
never behavior. Nothing stops a regression in `specArchive`'s gate logic, the
compass indexer, or the foundation scaffolder from compiling cleanly and
shipping broken.

Two concrete gaps:

1. **No behavioral coverage.** The highest-risk logic — `lawbook/engine.ts`
   (347 lines: init/validate/sync/archive + the archive preconditions),
   `compass/{indexer,query,extract,parser}`, `foundation/{scaffold,doctor}`,
   and the `shared/*` core — has zero executable tests. The standard itself
   already anticipates the fix: "when you add the first tests, wire a `test`
   script, add it to CI, and update this section."

2. **Merge is ungated on behavior and unenforced.** CI
   (`.github/workflows/ci.yml`) runs only `check` + `build`, and there is **no
   branch protection** on `main` codified anywhere — a red or test-less PR can
   be merged. There is no mechanism that makes "new code must be covered and
   green" a precondition for merge.

## What

1. **A four-layer automated test suite** using Node's built-in `node:test` (no
   new runtime dependency), in a top-level `test/` tree that mirrors `src/`:
   - **unit** — pure logic (`shared/{render,paths,manifest,version}`,
     `cli/lib/args`, `lawbook/engine` rules, `tools/packs`, `compass/query`);
   - **integration** — fs/sqlite logic against `mkdtemp` fixtures
     (`compass/{indexer,db,extract}`, `lawbook/engine` init→validate→sync→
     archive, `foundation/{scaffold,doctor}`);
   - **contract** — every `src/modules/*/register.ts`: Zod input validation and
     `text()` result wrapping, driven through the registered handlers;
   - **e2e** — spawn `node dist/cli/index.js {init,index,explore,doctor,
     lawbook}` in scratch repos and assert exit code + output.

   Tests are written in TypeScript and **type-checked** via a dedicated
   `tsconfig.test.json` that emits to a gitignored `dist-test/`, then run with
   `node --test`.

2. **An enforced coverage gate.** `npm test` runs
   `node --test --experimental-test-coverage` with **80%** thresholds on lines,
   functions, and branches (`--test-coverage-{lines,functions,branches}=0.8`).
   Coverage below the floor fails the command — so new uncovered code fails the
   gate. This is the mechanism that stops non-compliant code from being
   approved.

3. **CI runs the suite as a required check.** `ci.yml` gains a `test` job
   (`npm ci → npm run build → npm test`) that runs on every PR and every push to
   `main`, alongside the existing `check` + `build`.

4. **Branch protection on `main`.** A committed `.github/branch-protection.json`
   plus `scripts/apply-branch-protection.sh` (using `gh api`) codifies classic
   branch protection requiring the CI status checks to pass, a PR before merge,
   the branch up to date, linear history, and no force-push. The maintainer runs
   the script (it needs admin) — the agent does not mutate repo settings
   (Rule 6).

5. **The standard is amended.** `docs/standards/testing-standards.md` replaces
   "no unit-test runner yet" with the wired runner, the four-layer taxonomy, and
   the coverage + CI + protection gates. This is the spec amendment Rule 2
   requires; the delta spec formalizes it as the `quality-gates` capability.

## Non-goals

- **No new runtime or test dependency.** `node:test` + `node:assert/strict` +
  Node's native coverage only. No jest/vitest/tsx/c8.
- **No production/source behavior change.** This adds tests, CI wiring, config,
  and docs; it does not alter module logic. Any source edit is limited to what a
  test legitimately requires (e.g. exporting an already-internal pure helper),
  and each is called out in `design.md`.
- **The coverage gate checks the floor, not test quality.** 80% presence is
  mechanical; whether a test asserts something meaningful is review's job.
- **No release/publish changes.** `publish.yml` is untouched.

## Migrations

None. No data, no schema. The `dist-test/` build output is gitignored and never
published (`package.json` `files` stays `["dist", "ATTRIBUTION.md"]`).
