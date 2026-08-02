# Backend Standards — {{project_name}}

Rules for backend code. A law of the project — see [`../../LAWS.md`](../../LAWS.md).
Architecture and layer boundaries: [`architecture.md`](architecture.md).

## Layering — strictly enforced

<!-- speclaw init: fill the layer table from the repo's real backend structure.
Example (FastAPI):

| Layer | File | Responsibility |
|-------|------|----------------|
| Routes | router.py | HTTP + schema validation. No business logic. |
| Controller | controller.py | Business logic, use-case orchestration. |
| Manager | manager.py | Data access, transactions. |
| Domain | domain/ | Pure entities and rules. No I/O. |
-->
{{backend_layers}}

- Never write business logic in the transport/routes layer.
- Never write data-access code in the business layer.

## Formatting & linting

- Use the repo's configured linter/formatter. Run before committing.
- Lint / type-check command: `{{lint_commands}}`

## Docstrings — mandatory

Required on every public module, class, and function/method, in the repo's
documented style (e.g. Google-style `Args:`/`Returns:`/`Raises:` for Python).
Write them as you code, not afterward. Dunder and test functions are exempt.
Docstrings describe what and why — never ticket text.

## Typing

- Full signatures (arguments + return types) on public functions.
- Code must pass the repo's type-checker in strict mode.

## Tests

- New behavior ships with tests. Tests mock external systems (DB, network) via
  the project's fixtures — never hit a real database in unit tests.
- Test command: `{{test_commands}}`

## Migrations

- Use the migration tool's CLI; never handcraft revision identifiers.
- Keep a single linear head; rebase when the base branch moved.
- Schema changes must match what the spec proposal declared.
