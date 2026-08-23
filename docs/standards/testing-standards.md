# Testing & Quality Gates — speclaw

The quality law of the project — see [`../../LAWS.md`](../../LAWS.md). These
gates are non-negotiable: an agent runs them itself and reports real output
before declaring anything done.

## Gates

- **Lint + format**: `npm run check` — Prettier `--check` + ESLint
  (`eslint.config.js`). Fix formatting with `npm run format`.
- **Type-check + compile**: `npm run build` — `tsc` in `strict` mode followed by
  `scripts/copy-assets.mjs`.
- **Tests + coverage**: `npm run test` — compiles the `test/` tree with the
  source into `dist-test/` (via `tsconfig.test.json`, so tests are type-checked
  like source), then runs Node's built-in `node:test` runner with native
  coverage. **No new dependency** — `node:test` + `node:assert/strict` +
  `--experimental-test-coverage` only. The command **fails below 80%** line,
  function, or branch coverage of the source modules, so unverified new code
  cannot pass. Requires Node ≥ 24 (stable `node:sqlite`); run `npm run build`
  first so the end-to-end tests can drive the built CLI.

CI runs both jobs on every push to `main` and every PR
(`.github/workflows/ci.yml`): `build` (`npm ci && npm run check && npm run
build`) and `test` (`npm ci && npm run build && npm test`), reported as two
required status checks. PRs also run `.github/workflows/speclaw.yml` (the
`speclaw` check); speclaw never makes that check required itself — add it in
branch protection if you want PRs gated on law verification. `main` is
protected so a change merges only through a pull request whose `build` and
`test` checks pass on an up-to-date branch, with linear history and no
force-pushes — codified in `.github/branch-protection.json` and applied by
`scripts/apply-branch-protection.sh` (a maintainer with admin runs it; a status
check must run once before it can be required).

A red gate blocks the task. Fix it or report it — never work around it by
suppressing the compiler (no blanket `@ts-ignore`), disabling a lint rule inline
without a reason, lowering the coverage floor, or weakening a check.

## The test suite

Tests live in `test/`, mirroring `src/`, across four layers:

- **`test/unit/`** — pure logic (rendering, path/manifest/version helpers, flag
  parsing, the lawbook engine's rules, the embedder), with fixtures and no store.
- **`test/integration/`** — filesystem/sqlite behavior against `mkdtemp`
  fixtures: the Compass pipeline (index → search/explore/recall/impact/trace →
  visualize/watch), the lawbook engine flow (init → validate → sync → archive),
  and the foundation scaffold/doctor.
- **`test/contract/`** — each `src/modules/*/register.ts`: Zod input validation
  and `text()` result-wrapping, driven through a stub MCP server.
- **`test/e2e/`** — the built `dist/cli/index.js` spawned in scratch repos
  (`init`, `index`, `explore`, `doctor`, `lawbook`). e2e verifies CLI behavior;
  it runs in a child process and is excluded from the coverage denominator (as is
  the interactive CLI surface), which measures the in-process core.

Helpers live in `test/helpers/` (temp-repo factory, CLI runner, contract stub,
sample fixtures). See [`lawbook.md`](lawbook.md) for how a change records its
test evidence.

## What must be tested

- New behavior ships with tests using `node:test` — happy path plus at least one
  edge/error case — and must not drop coverage below the 80% floor.
- Bug fixes add a regression check that fails before the fix.
- Keep tests in the layer that fits: pure logic as a unit test, store-backed
  behavior as an integration test, a new MCP tool as a contract test, a new CLI
  command as an e2e test.

## Test hygiene

- Tests are deterministic and isolated — no live network, no reliance on a
  machine-specific `.speclaw/` index; build fixtures in a temp dir.
- A test "fixed" by weakening its assertion is not fixed.

## Manual & end-to-end verification

- speclaw is a CLI + MCP tool, so runtime verification means **running it**:
  build, then exercise the affected command (e.g. `node dist/cli/index.js init`
  in a scratch repo, `… index`, `… explore <node>`, `… doctor`), or drive the
  MCP tool. Don't assume a green build covers behavior.
- **Verification never touches real data.** Run it against an isolated/throwaway
  store — a temporary copy, an in-memory database, a dedicated test store, or a
  rolled-back transaction; speclaw's own verification uses scratch repos and temp
  dirs. Never create/update/delete real user data, and never run raw store
  commands (e.g. direct SQL) against a live store, to prove a change.
  Snapshot-and-restore is not sanctioned. If a real-store write is genuinely
  unavoidable, stop and get explicit authorization first — a backup is not a
  substitute (see Rule 6 in `CLAUDE.md`/`AGENTS.md`).
- The mandatory spec task steps ([`lawbook.md`](lawbook.md)) define which manual
  checks the agent must execute itself — the agent performs them, never delegates.

## Reports — evidence travels with the change

Every change records its testing under `lawbook/changes/<name>/reports/`, one
file per discipline it touched, named for that discipline. The set is open, not
fixed: `backend.md`, `frontend.md`, and `api.md` are the common ones, but write
`database.md`, `infra.md`, `security.md`, `performance.md`, `e2e.md`, etc. when
the change exercises those concerns. `build` produces them; `lawbook_archive`
refuses to archive a change whose `reports/` holds no discipline report.

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

When a test kind genuinely does not apply to a change (e.g. a docs-only change
with no code to unit-test), the report says so in place of that evidence and
records the gates and manual verification that stood in.
