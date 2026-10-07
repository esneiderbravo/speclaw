# Documentation Standard — speclaw

The docstring/API-comment law of the project — see [`../../LAWS.md`](../../LAWS.md).
One consistent convention per language, so every public API reads the same way.
Comment *philosophy* (what a comment is for) lives in
[`base-standards.md`](base-standards.md); this file defines the *format*.

## Convention per language

This repo is **TypeScript only** (ESM; build scripts are `.mjs`). One
convention:

| Language | Convention | Required tags (when applicable) |
|----------|------------|---------------------------------|
| TypeScript / JavaScript | TSDoc (superset of JSDoc) | `@param` · `@returns` · `@throws` · `@remarks` |

House style (see `src/shared/agents.ts`, `src/modules/foundation/laws-parse.ts`):
a leading sentence saying what and why, then `@param name - description` and
`@returns`, tags only where they add information. Short `/** … */` one-liners
are fine on obvious symbols — the point is intent, not ceremony. Inline `//`
comments carry constraints ("why"), never history.

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

No docstring linter is configured. TSDoc is enforced by **review** (the PR
template's checklist requires docstrings on new/changed exported API) and by
precedent across `src/`. A new or changed exported symbol is not done until it
carries TSDoc.
