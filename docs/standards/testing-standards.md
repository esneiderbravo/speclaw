# Testing & Quality Gates — speclaw

The quality law of the project — see [`../../LAWS.md`](../../LAWS.md). These
gates are non-negotiable: they run once, with real output, before anything is
declared done — by the `Stop` hook where installed (the agent then runs only
the tests its change touches, never the full suite twice), else by the agent
itself or `speclaw ship`.

## Gates

- **Tests**: `npm run build && npm test`
- **Lint / type-check**: `npm run check && npm run build`

In detail:

- **Lint + format**: `npm run check` — Prettier `--check` + ESLint
  (`eslint.config.js`). Fix formatting with `npm run format`.
- **Type-check + compile**: `npm run build` — `tsc` in `strict` mode followed by
  `scripts/copy-assets.mjs`.
- **Tests + coverage**: `npm test` — `pretest` compiles `src/` + `test/` into
  `dist-test/` via `tsconfig.test.json` (tests are type-checked like source)
  and prepares test assets; then Node's built-in `node:test` runs serially
  (`--test-concurrency=1`) with native coverage. **No test dependency** beyond
  `node:test`, `node:assert/strict`, and `fast-check` for property tests. The
  command **fails below 80%** line, function, or branch coverage. Requires
  Node ≥ 24 (stable `node:sqlite`, coverage thresholds); run `npm run build`
  first so the e2e tests can drive the built CLI.

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every PR:
`build` (Node 22: `npm ci && npm run check && npm run build`) and `test`
(Node 24: `npm ci && npm run build && npm test`). `main` is protected so a
change merges only when both checks pass on an up-to-date branch, with linear
history and no force-pushes — codified in `.github/branch-protection.json` and
applied by `scripts/apply-branch-protection.sh`.

A red gate blocks the task. Fix it or report it — never work around it by
suppressing the compiler (no blanket `@ts-ignore`), disabling a lint rule inline
without a reason, lowering the coverage floor, or deleting/weakening a test.

## The test suite

Tests live in `test/`, across five layers:

- **`test/unit/`** — pure logic (render, paths, manifest, version, flag
  parsing, the lawbook engine, ranking, budgets, hooks, git history), with
  fixtures and no store.
- **`test/integration/`** — filesystem/sqlite behavior against temp repos: the
  Compass pipeline (index → find/explore/impact/affected tests → watch/reindex),
  the lawbook flow (init → validate → sync → archive, quick, ship, bugfix),
  scaffold, doctor, integrity, hooks, and the MCP surface.
- **`test/contract/`** — each `register.ts`: Zod input validation and `text()`
  result shape, driven through a stub MCP server (`test/helpers/contracts.ts`).
- **`test/property/`** — `fast-check` properties (e.g. the EARS linter).
- **`test/e2e/`** — the built `dist/cli/index.js` spawned in scratch repos.
  It runs in a child process and is outside the coverage denominator.

Helpers live in `test/helpers/` (`env.ts` temp-repo factory `tmpRepo`/`write`,
`cli.ts` runner, `git.ts`, `contracts.ts`, `fixtures.ts`, `brand.ts`).

## What must be tested

- Every new behavior ships with tests covering the happy path and at least one
  edge/error case, in the layer that fits: pure logic → unit, store-backed →
  integration, a new MCP tool → contract, a new CLI command → e2e.
- Bug fixes ship with a regression test that fails before the fix.
- Permission/authorization paths are tested when the change touches them.

## Test hygiene

- Tests are deterministic and isolated — no live network, no reliance on a
  machine-specific `.speclaw/` index or this repo's own scaffold; build
  fixtures in a temp dir with `tmpRepo(t)`.
- A test "fixed" by weakening its assertion is not fixed.

## Manual & end-to-end verification

- speclaw is a CLI + MCP tool, so runtime verification means **running it**:
  build, then exercise the affected command in a scratch repo (e.g.
  `node dist/cli/index.js init`, `… index`, `… explore <node>`, `… doctor`), or
  drive the MCP tool. Don't assume green CI covers behavior.
- Performance-motivated changes carry a main-vs-branch benchmark
  (`scripts/bench/`) recorded as `reports/performance.md`.
- **Verification never touches real data.** Run it against an isolated store — a
  temporary copy, an in-memory database, a dedicated test store, or a rolled-back
  transaction — or against pure logic with fixtures. Never create/update/delete
  the user's real data (a production or development database, or files holding
  real data), and never run raw store commands (e.g. direct SQL) against a live
  store, to prove a change. Snapshot-and-restore is not sanctioned. If a
  real-store write is genuinely unavoidable, stop and get explicit authorization
  first — a backup is not a substitute (see the stop conditions in the
  constitution).
- The mandatory spec task steps
  ([`lawbook.md`](lawbook.md)) define which manual checks
  the agent must execute itself.

## Reports — evidence travels with the change

Every change records its testing under `lawbook/changes/<name>/reports/`, one
file per discipline it touched, named for that discipline. The set is open, not
fixed: `backend.md`, `frontend.md`, and `api.md` are the common ones, but write
`database.md`, `infra.md`, `security.md`, `performance.md`, `e2e.md`, etc. when
the change exercises those concerns. `build` produces them; archiving is blocked
until the change has at least one discipline report.

`api.md` is **mandatory whenever the change touches an API surface** — a new or
modified endpoint, its contract, its status codes, or its auth/permission or
ordering guarantees — and a `backend.md` unit report does not substitute for it.
It documents the method and path, the auth/permissions, the response shape and
every status code the change governs, any ordering guarantee, and how the
contract was exercised (test client and/or `curl`) kept isolated from live data.

Each report MUST follow a fixed structure, so the evidence is reproducible rather
than improvised:

1. a **header** — discipline, change, date, branch, and the environment or
   working directory the commands ran in;
2. a **gates-and-results table** — each check, the exact command, and its real
   result with pass/fail counts;
3. the **tests added or updated** and what each asserts (TDD evidence where it
   applies);
4. a **spec-scenario coverage table** mapping every `#### Scenario` in the
   change's delta specs to how it was verified (a test, a gate, or a manual step);
5. an honest declaration of any **pre-existing or unrelated failures** with proof
   they are not caused by the change — or "none";
6. the **manual steps not automated** — or "none";
7. a one-line **verdict**.

When a test kind does not yet apply (e.g. no unit runner), the report says so in
place of that evidence and records the gates and manual verification that stood
in.
