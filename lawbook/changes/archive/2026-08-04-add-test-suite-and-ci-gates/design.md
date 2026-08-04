# Design — add-test-suite-and-ci-gates

## Approach

Add tests and gating without adding dependencies and without touching module
logic. Four concerns: the test toolchain, the test tree, the CI wiring, and the
merge protection.

### 1. Test toolchain — compile then run

- **`tsconfig.test.json`** extends the base config, sets `rootDir: "."`,
  `outDir: "dist-test"`, and `include: ["src/**/*", "test/**/*"]` so tests are
  type-checked against real source types (imports resolve to `src`, not the
  published `dist`). Keeps `strict`. Emits JS so `node --test` needs no loader
  or experimental flag.
- **`package.json` `test` script:**
  ```
  tsc -p tsconfig.test.json && node --test --experimental-test-coverage \
    --test-coverage-lines=0.8 --test-coverage-functions=0.8 \
    --test-coverage-branches=0.8 --test-coverage-exclude='test/**' \
    --test-coverage-exclude='dist-test/**' 'dist-test/test/**/*.test.js'
  ```
  Tests run from `dist-test/` but the emitted files carry source paths; coverage
  reports against the compiled module JS. Exclude `test/**` so the suite's own
  code is not counted toward the module coverage floor.
- **`.gitignore`** += `dist-test/`. The published package is unaffected —
  `files` stays `["dist", "ATTRIBUTION.md"]`.

Why compile rather than native type-stripping (`--experimental-strip-types`):
full type-checking of tests, deterministic on any Node 22.x (not only ≥22.18),
and no reliance on an experimental parser. Cost is one extra `tsc` pass — cheap
and already how source builds.

### 2. Test tree — `test/` mirrors `src/`, four layers

```
test/
  helpers/        tmpRepo() (mkdtemp factory), runCli() (spawn), file asserts
  fixtures/       tiny sample repos (multi-language) + a sample lawbook change
  unit/           shared/*, cli/lib/args, lawbook/engine rules, tools/packs, compass/query
  integration/    compass/{indexer,db,extract}, lawbook/engine flow, foundation/{scaffold,doctor}
  contract/       modules/*/register.ts — Zod validation + text() wrapping
  e2e/            node dist/cli/index.js {init,index,explore,doctor,lawbook}
```

- **Isolation:** every fs/sqlite test builds its world in `os.tmpdir()` via
  `mkdtemp` and tears it down in `t.after`. No reliance on the repo's own
  `.speclaw/` index, no network — per `testing-standards.md` hygiene.
- **e2e** exercises the *built* CLI (`dist/cli/index.js`), so CI must
  `npm run build` before `npm test`. This directly satisfies the standard's
  "runtime verification means running it."
- **contract** tests import each `register.ts`'s registration against a stub
  MCP server that captures the registered handlers, then invoke them — asserting
  bad input is rejected by Zod and good output is wrapped by `text()`. This
  guards the transport boundary the architecture standard defines as "thin".

### 3. CI — a `test` job as a required check

`ci.yml` gains a second job:
```
test:
  runs-on: ubuntu-latest
  steps: checkout → setup-node 22 (npm cache) → npm ci → npm run build → npm test
```
Kept separate from `build` so the check name `test` is independently required.
Triggers are unchanged (`push: [main]`, `pull_request`), so it runs on every PR.

### 4. Merge protection — classic branch protection, applied by the maintainer

- **`.github/branch-protection.json`** — the exact payload for
  `PUT /repos/:owner/:repo/branches/main/protection`: `required_status_checks`
  = the three check contexts (`check`/lint job, `build`, `test`) with
  `strict: true` (branch must be up to date); `required_pull_request_reviews`
  (0 approvals — solo maintainer — but PR required via `enforce_admins` +
  linear history); `required_linear_history: true`;
  `allow_force_pushes: false`; `allow_deletions: false`.
- **`scripts/apply-branch-protection.sh`** — resolves owner/repo from the git
  remote and `gh api --method PUT … --input .github/branch-protection.json`.
  Prints the ordering caveat: a status check can only be *required* after GitHub
  has seen it run at least once, so the CI change must land (or the branch push
  once) before protection is applied. The script is run by the maintainer with
  admin; the agent does not touch repo settings (Rule 6).

### Job/check naming

The existing `ci.yml` job is named `build` and runs check+build. To make the
lint and compile gates independently visible as required checks, the `build`
job keeps its name (runs `npm run check` + `npm run build`) and the new `test`
job is added. `branch-protection.json` requires contexts `build` and `test`.
(Splitting `check` into its own job is optional; keeping it inside `build`
matches today's workflow and keeps the diff minimal — noted as an alternative
below.)

## Alternatives weighed

1. **Native type-stripping (`node --test --experimental-strip-types
   'test/**/*.ts'`)** — no second compile. Rejected as the default: requires
   Node ≥22.18, leans on an experimental parser, and forbids a few TS features
   in tests. The compile path is more robust and fully type-checks tests. (If
   the extra `tsc` pass ever hurts, this is the fallback.)

2. **Add jest or vitest.** Rejected: violates the "no new dependency" line in
   `testing-standards.md`. `node:test` covers describe/it, hooks, mocks, and
   coverage natively on Node ≥22.

3. **GitHub repository *rulesets* instead of classic branch protection.**
   Considered and offered; the maintainer chose classic branch protection.
   Classic protection is simpler to express as a single API payload and is
   sufficient for a single protected branch. A committed JSON + apply script
   keeps it reproducible either way.

4. **Coverage: ratchet from a low floor, or report-only first.** Rejected by
   decision: enforce 80% immediately. Consequence (accepted): `main` stays red
   until the full suite lands, so this ships as **one comprehensive change/PR**
   — no partial merges. Handled by scoping all modules into this change.

5. **Let `build` step also run tests (single job).** Rejected: a separate
   `test` job gives an independently-required check and clearer CI signal; the
   extra `npm ci` cost is minor.

## Trade-offs

- **One large change.** All modules + CLI + contracts + e2e in a single PR is
  big, but the 80%-now decision requires it — a partial suite would put `main`
  below the floor. Kept coherent by one spec (`quality-gates`) and an ordered
  `tasks.md`.
- **80% is a floor, not a proof.** It can be met by shallow tests. Accepted:
  presence is the mechanical gate; assertion quality is review's job — the same
  split the archive-gate change made for reports.
- **Protection needs a manual apply and correct ordering.** The agent cannot
  (and by Rule 6 should not) mutate repo settings, and a check must run once
  before it can be required. The script encodes the order and the maintainer
  runs it; the JSON keeps it reproducible and reviewable.
- **Possible minimal source edits for testability.** If a pure helper needs to
  be exported to be unit-tested, that is a surface change, not a behavior
  change; each such export is listed in the change and kept to the minimum.

## Affected files

- **Toolchain:** `tsconfig.test.json` (new), `package.json` (`test` script),
  `.gitignore` (`dist-test/`).
- **Tests:** `test/**` (new — helpers, fixtures, unit, integration, contract,
  e2e).
- **CI:** `.github/workflows/ci.yml` (add `test` job).
- **Protection:** `.github/branch-protection.json` (new),
  `scripts/apply-branch-protection.sh` (new).
- **Docs/standard:** `docs/standards/testing-standards.md` (amended) and the
  foundation template it derives from
  (`src/modules/foundation/assets/docs/standards/testing-standards.template.md`)
  if the wording is shared.
- **Source:** none expected beyond minimal test-only exports, each noted in
  `tasks.md`.
