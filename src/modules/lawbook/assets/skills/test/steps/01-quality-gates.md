# Quality gates (mandatory)

Run the repo's gates from `docs/standards/testing-standards.md`:

- Tests: `{{test_commands}}`
- Lint / type-check: `{{lint_commands}}`

Call `compass_diff_context` first: it lists the tests that cover the diff, so a
failure points at the right suite instead of a re-read of the code. Then run
the gates yourself and report real output. A red gate blocks completion.

Next: read `steps/02-manual-verification.md` and do only what it says.
