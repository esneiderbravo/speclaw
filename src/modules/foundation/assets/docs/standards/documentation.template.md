# Documentation Standard — {{project_name}}

The docstring/API-comment law of the project — see [`../../LAWS.md`](../../LAWS.md).
One consistent convention per language, so every public API reads the same way.
Comment *philosophy* (what a comment is for) lives in
[`base-standards.md`](base-standards.md); this file defines the *format*.

## Convention per language

Defaults below are the idiomatic choice per language. During standardization,
confirm each against what this repo actually uses and adjust if the team
follows a different one (e.g. NumPy-style Python).

| Language | Convention | Required sections |
|----------|------------|-------------------|
| Python | Google-style (PEP 257 base) | `Args:` · `Returns:` · `Raises:` |
| TypeScript / JavaScript | TSDoc (superset of JSDoc) | `@param` · `@returns` · `@throws` · `@remarks` |
| Java | Javadoc | `@param` · `@return` · `@throws` |
| Kotlin | KDoc | `@param` · `@return` · `@throws` |
| Go | godoc | full-sentence comment beginning with the identifier name; no tags |
| Rust | rustdoc (`///`, markdown) | `# Examples` · `# Errors` · `# Panics` (when applicable) |
| C# | XML doc comments | `<summary>` · `<param>` · `<returns>` |
| Ruby | YARD | `@param` · `@return` |
| PHP | PHPDoc | `@param` · `@return` · `@throws` |
| Swift | Swift markup | `- Parameters:` · `- Returns:` · `- Throws:` |

<!-- speclaw init: keep only the rows for languages this repo uses, and confirm
the chosen convention matches the codebase. Add the actual style config file if
the repo enforces one (e.g. a docstring linter). -->
{{documentation_extra}}

## Rules

- **Required on every public API**: exported/public modules, classes,
  functions, and methods. Internal helpers get a docstring when their intent
  isn't obvious from the name.
- **Write them as you code**, not afterward — a new or changed public symbol is
  not done until it is documented.
- **Describe intent and contract** (what and why, inputs/outputs, errors), not
  a restatement of the syntax. No ticket text, no changelog narration.
- **Exempt**: trivial dunders/accessors and test functions, unless they carry
  non-obvious behavior.
- **One style per language** — never mix conventions within the same language
  in the repo.

## Enforcement

Prefer a docstring linter in the quality gates when the language has one
(e.g. `ruff`'s pydocstyle rules for Python, `eslint-plugin-jsdoc` for TS/JS).
List the concrete command in [`testing-standards.md`](testing-standards.md).
