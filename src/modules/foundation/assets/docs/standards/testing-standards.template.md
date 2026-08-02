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
  ([`spec-workflow.md`](spec-workflow.md)) define which manual checks
  the agent must execute itself.
