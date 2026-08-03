# Documentation Standard — speclaw

The docstring/API-comment law of the project — see [`../../LAWS.md`](../../LAWS.md).
One consistent convention per language, so every public API reads the same way.
Comment *philosophy* (what a comment is for) lives in
[`base-standards.md`](base-standards.md); this file defines the *format*.

## Convention per language

This repo is **TypeScript only** (ESM). One convention:

| Language | Convention | Required tags (when applicable) |
|----------|------------|---------------------------------|
| TypeScript | TSDoc (superset of JSDoc) | `@param` · `@returns` · `@throws` · `@remarks` |

Short block comments (`/** … */`) on one-liners are fine — the point is intent,
not ceremony. See `src/shared/mcp.ts` and `src/cli/index.ts` for the house
style: a leading sentence saying what and why, tags only where they add
information.


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

No docstring linter is configured. TSDoc is enforced by **review** and by the
strict `tsc` build — and by precedent: the commit
`docs: complete TSDoc on the new visualize files (per documentation standard)`
records that new public files ship documented. A new or changed exported symbol
is not done until it carries TSDoc.
