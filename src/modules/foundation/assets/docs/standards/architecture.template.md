# Architecture — {{project_name}}

The structural law of the project. Every change respects these boundaries —
see [`../../LAWS.md`](../../LAWS.md). Use `compass_explore` to navigate the
real code before editing.

- **Overall shape**: {{architecture}}
- **Stack**: {{stack_summary}}

## Modules / bounded contexts

<!-- speclaw init: list the real modules/bounded contexts of this repo, each
with a one-line responsibility. Derive them from the actual directory layout
(e.g. src/modules/*, apps/*), never invent them. Example:

| Module | Responsibility |
|--------|----------------|
| planning | assignment engine, coverage, scheduling |
| workforce | employees, skills, availability |
-->
{{modules_table}}

## Layering

<!-- speclaw init: describe the layers and their allowed dependencies, per the
repo's real architecture. Keep the "strictly enforced" tone. Example for a
hexagonal backend: Routes -> Controller -> Manager -> Domain, with the rules
about what each layer may and may not do. -->
{{layering_rules}}

## Cross-boundary rules

- Dependencies point inward: outer layers depend on inner, never the reverse.
- Business logic never leaks into transport (HTTP handlers) or persistence.
- A change that crosses a module boundary needs a spec change describing
  the new contract.
