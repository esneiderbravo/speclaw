# add-requirement-coverage — requirement → code → test coverage gate

## Why

Agents declare work "done" without a machine check that each requirement has
implementation and test evidence. Spec Kit / OpenSpec produce prose; none verify
per-requirement coverage. OpenFastTrace proved the model (stable IDs + revision
invalidation) in safety-critical stacks; speclaw lacks an idiomatic TypeScript /
agent-oriented equivalent. This is roadmap piece **trace** (`docs/roadmap/runtime/trace.md`),
ordered after `verify-ci` and `git-history`.

## What

Ship a **v1 coverage surface** (names avoid colliding with Compass call-path
`speclaw trace` / `compass_trace`):

1. **Stable requirement IDs** in specs: `` `req~<name>~<revision>` `` on
   `### Requirement:` headings (OpenFastTrace-shaped, explicit — not title-derived).
2. **Coverage links** from AST comment nodes (`// Covers: req~…~N`, `# Covers:`,
   JSDoc `@covers`) attributed to the following / enclosing symbol; artifact
   type inferred from path globs (`impl` / `utest` / `itest`).
3. **Report engine** — shallow coverage, link statuses
   (`Covers` / `Outdated` / `Predated` / `Orphaned` / `Unwanted` / `Ambiguous`),
   direct vs transitive defects; TAP (non-TTY) + table (TTY) + `--json`.
4. **Surfaces** — CLI `speclaw coverage`, MCP `lawbook_coverage` (defect-first,
   ≤600 tokens for agents).
5. **Archive gate** — `specArchivePreconditions` blocks on **direct** defects of
   **approved** items that carry IDs; **zero IDs ⇒ opt-in / no block**.
6. **`--adopt`** — propose IDs for existing headings (dry-run default; `--write`
   respects personalized ownership; never invents `Needs:`).

Bump Compass `SCHEMA_VERSION` `"4"` → `"5"` for a derived `coverage_links` table
rebuilt on index (truth stays in comments + specs on disk).

## Non-goals (v1)

- Renaming or overloading `compass_trace` / CLI `speclaw trace` (call paths).
- Deep OFT hierarchy value (`feat`/`dsn` trees) beyond implementing the algorithm
  correctly when only `req`+code exist (deep ≡ shallow).
- Drift-anchor bootstrap of `Covers:` (depends on undelivered `drift`).
- `--export oft`, ReqIF, ears-property / `stest` enforcement.
- Auto-detecting that a revision *should* bump (strict warning deferred).
- Scenario-level gating (`#### Scenario:` sub-ids are parse-only / future flag).

## Migrations

Yes — Compass schema `"5"` (full reindex). Project `speclaw update` migration
entry for 0.3.8 documenting `speclaw coverage` + adopt. Patch version bump on
ship.
