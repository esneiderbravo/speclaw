# add-ears-property — EARS requirement patterns + property-coverage gate

## Why

speclaw already validates `### Requirement:` headings with `SHALL`/`MUST` and
GIVEN/WHEN/THEN scenarios. That is the ubiquitous EARS pattern without the
name. Nothing yet:

1. Forces the other EARS molds (WHEN / WHILE / IF…THEN / WHERE / complex), or
2. Gates archive/validate when a requirement declares it needs a **property**
   test and none covers it.

Kiro closes that loop inside a proprietary IDE. speclaw's product move is the
**link**, not a PBT engine: recognize runners (fast-check, Hypothesis, …),
require `Needs: ptest` + `Covers:` evidence, and fail when missing.

Roadmap **ears-property** (#17). Explore (2026-08-25) locked:

| # | Decision |
| --- | --- |
| 1 | **Full scope** in one change: EARS linter + `ptest` coverage gate + dogfood |
| 2 | **`Needs: ptest`** is the source of truth (not a free-floating Verification enum) |
| 3 | **No new MCP tool** — extend `lawbook_change` validate/coverage + CLI |
| 4 | **Strict** — this repo dogfoods all specs; unstructured / missing `ptest` fail |
| 5 | Ceremony **level 3** (graph proposed 2; human override) |

## What

1. **`ears.ts`** — classify requirement normative text into EARS patterns;
   emit stable diagnostic codes + deterministic rewrite **suggestions** (never
   auto-edit files).
2. **`specValidate` / `speclaw lawbook validate`** — report EARS diagnostics;
   under `ears.severity: strict`, unstructured / no-modal / IF↔THEN errors are
   blocking issues.
3. **Coverage** — recognize artifact type `ptest`; when `Needs:` includes
   `ptest`, require a covering link whose path+nearby lines invoke a configured
   property runner (existence + reference only — **do not run tests**).
4. **Config** — `ears.severity` (`strict` for speclaw), vague-word list,
   `propertyRunners` patterns; optional `Verification: property` sugar that
   expands effective needs to include `ptest` when `Needs:` omitted that token.
5. **Dogfood** — rewrite speclaw `lawbook/specs/**` into valid EARS; add at
   least one real fast-check property covering the EARS parser itself.
6. **Surface** — zero new MCP tools; keep tool-surface consolidation.

## Non-goals

- Implementing a PBT / shrinking engine.
- Generating property tests or templates that invent domain generators.
- Auto-rewriting requirement prose (`--fix`).
- Linting Gherkin scenario structure beyond today's GIVEN/WHEN/THEN presence
  checks (follow-up).
- New SQL `requirements` table (coverage already uses `SpecItem` + links).
- New MCP tool `lawbook_requirements`.

## Migrations

- Additive config keys under `lawbook/config.yaml` (`ears`, `propertyRunners`).
- speclaw itself sets **`ears.severity: strict`**; scaffolds for new projects
  MAY default to strict (locked in explore as duro).
- Specs without EARS molds fail validate/archive in this repo until rewritten
  in the same PR.

## Capabilities

- `requirement-coverage` — `ptest` artifact type, runner recognition, Needs/ptest gate
- `lawbook-workflow` — EARS diagnostics in validate; archive/validate severity
- `cli` — validate/coverage messaging for EARS + ptest; no new top-level command required
