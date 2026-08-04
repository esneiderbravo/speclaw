# Testing & Quality Gates — {{project_name}}

The quality law of the project — see [`../../LAWS.md`](../../LAWS.md). These
gates are non-negotiable: an agent runs them itself and reports real output
before declaring anything done.

## Gates

- **Tests**: `{{test_commands}}`
- **Lint / type-check**: `{{lint_commands}}`

A red gate blocks the task. Fix it or report it — never work around it by
suppressing a linter or deleting a test.

## What must be tested

- Every new behavior ships with tests covering the happy path and at least one
  edge/error case.
- Bug fixes ship with a regression test that fails before the fix.
- Permission/authorization paths are tested when the change touches them.

## Test hygiene

- Unit tests are deterministic and isolated — mock external systems via the
  project's fixtures; never depend on a live database or network.
- A test "fixed" by weakening its assertion is not fixed.

## Manual & end-to-end verification

- When a change affects runtime behavior and it's feasible, verify it works by
  exercising the endpoint/UI — don't assume green CI covers everything.
- The mandatory spec task steps
  ([`lawbook.md`](lawbook.md)) define which manual checks
  the agent must execute itself.

## Reports — evidence travels with the change

Every change records its testing under `lawbook/changes/<name>/reports/`, one
file per discipline it touched (`backend.md`, `frontend.md`, …). `build`
produces them; archiving is blocked until the change has at least one discipline
report.

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
