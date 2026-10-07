# Backend Standards — speclaw

Rules for **all** the TypeScript code in this repo (there is no separate
"frontend" — see [`frontend-standards.md`](frontend-standards.md)). A law of the
project — see [`../../LAWS.md`](../../LAWS.md). Architecture and layer
boundaries: [`architecture.md`](architecture.md).

## Layering — strictly enforced

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| Entrypoints | `src/server.ts`, `src/cli/index.ts` | Wire the MCP server / dispatch CLI commands (lazy `import()`). No business logic. |
| CLI commands | `src/cli/commands/*.ts` | One file per command: parse flags, render terminal UI, delegate to modules/shared. Thin. |
| CLI lib | `src/cli/lib/*.ts` | Arg parsing (`args.ts`), Clack UI (`ui.ts`), help, update/self-update. Presentation helpers only. |
| Tool registration | `src/modules/*/register*.ts` | MCP transport boundary: Zod-validate inputs, wrap results with `text()`, delegate. No business logic inline. |
| Module logic | `src/modules/*/*.ts` | The real work per module (`scaffold`, `doctor`, `engine`, `indexer`, `parser`, `query`, `harness`, …). I/O isolated here. |
| Shared core | `src/shared/*.ts` | Cross-cutting primitives. Must not import from `modules/` or `cli/`. |

- Never write business logic in a transport (`register.ts`, CLI command handler)
  — validate and delegate.
- Opening, creating, and migrating the index database belongs to
  `compass/db.ts`; other code receives a `DatabaseSync` handle and imports only
  its type.
- A capability is implemented once — do not duplicate module logic between the
  CLI and MCP surfaces.
- MCP outputs respect the output budget (`shared/output-budget.ts`) and the
  declared tool-surface budget (`token-budget.json`); token economy is a
  product requirement.

## Formatting & linting

- **Formatting is Prettier's job** (`.prettierrc`: 100-col, trailing commas;
  2-space indent, double quotes, semicolons). Run `npm run format` to fix,
  `npm run check` to verify. Never hand-fight the formatter.
- **Linting is ESLint** (flat config `eslint.config.js`: `@eslint/js` +
  `typescript-eslint` recommended, with `eslint-config-prettier` last so it
  never conflicts with Prettier). Run `npm run lint`.
- A leading underscore (`_flags`) marks an intentionally-unused binding — the
  lint config honors `^_`; don't delete such params.
- Lint / type-check command: `npm run check && npm run build`
- Markdown is **not** formatted by Prettier (`.prettierignore`) — the docs and
  speclaw's template assets are hand-wrapped and carry `{{placeholder}}`/
  HTML-comment contracts.

## Docstrings — mandatory

TSDoc on every exported module, function, class, and type, written as you
code. Use `@param`/`@returns`/`@throws`/`@remarks` as applicable. Docstrings
describe what and why — never ticket text. Test functions are exempt. Full
rules: [`documentation.md`](documentation.md).

## Typing

- Full signatures (parameter + return types) on exported functions.
- ESM discipline: relative imports use explicit `.js` extensions (Node16
  resolution requires it), and the package is `"type": "module"`.
- Code must pass `tsc` in `strict` mode — no `any` escape hatches, no
  `@ts-ignore` without a constraint comment explaining why.
- MCP tool inputs are validated with Zod schemas at the registration boundary.

## Tests

- New behavior ships with `node:test` coverage (no new dependency) — a unit or
  integration test for the logic, a contract test for a new MCP tool, an e2e
  test for a new CLI command — plus, when it affects runtime, verification by
  exercising the CLI (`node dist/cli/index.js …`) in a scratch repo.
- Test command: `npm run build && npm test` (80% line/function/branch coverage
  floor). See [`testing-standards.md`](testing-standards.md).

## Persistence & assets

- The only persistence is the Compass code graph in `.speclaw/index.db`
  (`node:sqlite`), owned by `compass/db.ts` and gitignored. There are no
  migration files: a schema change bumps the index schema version so the next
  run reindexes (and must say so in the changelog and `docs/compass.md`).
- Product assets (templates, seed laws, packs, skills, agents) live under
  `src/modules/*/assets/**` and are copied to `dist/` by
  `scripts/copy-assets.mjs`. A new asset must be picked up by that script —
  never hand-copy into `dist/`.
