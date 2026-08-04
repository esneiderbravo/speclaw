# Quality Gates

The project's automated verification law: the test suite, the coverage floor,
the CI checks, and the merge protection that together stop unverified or
non-compliant code from reaching `main`. Governs
`docs/standards/testing-standards.md`, `.github/workflows/ci.yml`, and the
branch-protection configuration.

### Requirement: Automated test suite

The project SHALL provide an automated test suite, run by `npm test`, using
Node's built-in `node:test` runner and `node:assert/strict` with **no new
runtime or test dependency**. Tests SHALL live in a top-level `test/` tree that
mirrors `src/`, be written in TypeScript, and be type-checked (via
`tsconfig.test.json`) before running. The suite SHALL cover every module across
four layers — **unit** (pure logic), **integration** (filesystem/sqlite against
temporary fixtures), **contract** (each `src/modules/*/register.ts` transport
boundary), and **end-to-end** (the built CLI) — and every test SHALL be
deterministic and isolated (temporary directories, no live network, no reliance
on the repository's own `.speclaw/` index).

#### Scenario: The suite runs green from a clean checkout
- Given a clean checkout with dependencies installed and `npm run build` run
- When a maintainer runs `npm test`
- Then the TypeScript tests compile via `tsconfig.test.json` and all tests pass

#### Scenario: Every module is exercised
- Given the `test/` tree
- When the suite runs
- Then each source module (foundation, compass, lawbook, tools, shared, cli) is
  exercised by at least one unit or integration test, each `register.ts` by a
  contract test, and the CLI by at least one end-to-end test

#### Scenario: Tests do not touch real data
- Given any filesystem- or sqlite-backed test
- When it runs
- Then it builds its world in a temporary directory and removes it afterward,
  never writing to the repository's own store or any real user data

#### Scenario: No new dependency is introduced
- Given `package.json`
- When the test tooling is added
- Then no test framework or coverage dependency is added — only `node:test`,
  `node:assert/strict`, and Node's native coverage are used

### Requirement: Enforced coverage floor

`npm test` SHALL measure coverage with Node's native coverage and FAIL when
line, function, or branch coverage of the measured source falls below **80%**
(the thresholds are expressed as 0–100 percentages).

The measured source is the **in-process core** the suite loads directly —
`src/shared/**`, `src/modules/**`, and `src/cli/lib/args`. The following are
excluded from the coverage denominator and verified by behavior instead: the
suite's own files (`test/**`), and the **interactive CLI surface**
(`src/cli/commands/**`, `src/cli/lib/{ui,update-check}`, the CLI entrypoint, and
`src/server.ts`), which runs in a child process driven by the end-to-end suite
and so is not captured by in-process coverage.

#### Scenario: Coverage below the floor fails the command
- Given the measured source coverage is below 80% on lines, functions, or
  branches
- When `npm test` runs
- Then the command exits non-zero and reports the shortfall

#### Scenario: New uncovered code is rejected
- Given a change that adds in-process source lines with no accompanying test
- When `npm test` runs and the additions push coverage below 80%
- Then the command fails, so the change cannot pass the gate until it is covered

#### Scenario: The interactive CLI is verified by end-to-end tests
- Given a command in the interactive CLI surface
- When it is exercised
- Then an end-to-end test drives the built CLI as a child process and asserts its
  behavior, standing in for in-process coverage of that surface

### Requirement: Continuous integration runs the gates

Continuous integration SHALL run the lint/format + compile gates
(`npm run check`, `npm run build`) and the test suite (`npm test`) on every pull
request and every push to `main`, as status checks that can be required for
merge.

#### Scenario: CI runs the test suite on a pull request
- Given a pull request against `main`
- When CI runs
- Then a `test` job builds the project and runs `npm test`, and its result is
  reported as a status check distinct from the lint/compile check

#### Scenario: A failing test blocks the CI check
- Given a pull request whose changes make a test fail or drop coverage below the
  floor
- When CI runs
- Then the `test` status check reports failure

### Requirement: Protected main branch

The `main` branch SHALL be protected so that changes merge only through a pull
request whose required status checks — the lint/compile check and the `test`
check — have passed on an up-to-date branch, with linear history and without
force-pushes or branch deletion. The protection SHALL be codified in the
repository (a committed configuration and an apply script) rather than existing
only as unversioned repository settings.

#### Scenario: Protection configuration is committed and reproducible
- Given the repository
- When a maintainer inspects `.github/`
- Then a committed branch-protection configuration and an apply script exist,
  such that the protection can be reproduced from source

#### Scenario: A pull request with failing checks cannot merge
- Given the protection is applied and a pull request whose required checks are
  failing or pending
- When a merge is attempted
- Then the merge is blocked until the required checks pass on an up-to-date
  branch

#### Scenario: Direct pushes and force-pushes to main are refused
- Given the protection is applied
- When a direct push, a force-push, or a branch deletion targets `main`
- Then it is refused
