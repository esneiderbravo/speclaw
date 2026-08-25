# Design — add-ears-property

## Decisions (confirmed in explore)

| # | Decision |
| --- | --- |
| Scope | EARS linter + `ptest` gate + strict dogfood in **one** PR |
| Declaration | `Needs: ptest` is source of truth |
| Sugar | `Verification: property` MAY add `ptest` to effective needs; never replaces `Needs:` |
| MCP | **No** new tool; extend `lawbook_change` validate/coverage |
| Severity | **`strict`** for speclaw (and scaffold default) |
| Ceremony | Level 3 |
| Engine | Recognize runners only; never execute or generate PBT |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Pattern classify + suggest | `lawbook/ears.ts` (new) | Pure, unit-testable; no I/O |
| Keyword parse (`Needs`, optional `Verification`) | `lawbook/spec-items.ts` | Same keyword grammar as Status/Tags |
| Wire diagnostics into validate | `lawbook/engine.ts` `specValidate` | Existing entry; severity from config |
| `ptest` in needs + uncoveredTypes | `lawbook/coverage.ts` | Archive already uses `coverageArchiveBlockers` |
| Infer `ptest` from path / runner window | `coverage.ts` + ears helpers | Path globs alone are weak; peek ~5 lines after `Covers:` |
| Config | `lawbook/config.yaml` + loader | Per-project severity + runner list |
| CLI messaging | `cli/commands/lawbook.ts`, `coverage` | Surface diagnostics; no new MCP tool |
| Dogfood specs | `lawbook/specs/**` | Strict mode only works if we comply |
| Real property | `test/property/ears*.test.ts` + fast-check | Proves the gate with living evidence |

**Precedence for EARS (most specific first):** complex → unwanted (IF…THEN) →
state (WHILE) → event (WHEN) → optional (WHERE) → ubiquitous (modal, no
precondition) → unstructured.

**Property gate checks:**

1. Effective needs include `ptest` (explicit `Needs:` and/or Verification sugar).
2. At least one coverage link classifies as `ptest` and status `Covers`.
3. Near the link line, a configured runner invocation appears (non-comment).
4. Revision outdated/orphaned rules inherit from coverage as-is.

**Property gate does NOT:** run tests, assert property correctness, rewrite
specs, or invent generators.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| EARS-only first, gate later | Human chose full scope |
| New `lawbook_requirements` MCP tool | Undoes tool-surface; list via validate/coverage |
| SQL `requirements` table | Duplicate of `SpecItem` + coverage links |
| Generate property stubs | Decorative tests; false confidence |
| Default `lenient` | Human chose **duro** / strict dogfood |
| `Verification:` as sole SoT | Explore locked `Needs: ptest` |

## Trade-offs

- **Strict day-1** — every speclaw requirement must pass EARS in this PR;
  validate/archive will fail until dogfood lands.
- **Runner heuristics** — comment-out / `numRuns: 1` can game a naive gate;
  mitigate with nearby-line scan + optional min-runs warn; human review owns the rest.
- **Vague-word list** — high value, high false-positive risk → configurable,
  default warn even under strict (unless explore implies hard fail; keep
  vague as warn so agents do not disable the whole linter).
- **No scenario EARS** — scenarios stay example-shaped; properties attach at
  requirement level.

## File plan

```
src/modules/lawbook/ears.ts              NEW classify + suggest + diagnostics
src/modules/lawbook/spec-items.ts        Verification keyword; needs merge
src/modules/lawbook/coverage.ts          ptest type; runner recognition
src/modules/lawbook/engine.ts            EARS issues/warnings in validate
src/modules/lawbook/config loaders       ears + propertyRunners
lawbook/config.yaml                      severity strict; runners; vague list
src/cli/commands/lawbook.ts (+ coverage) messaging / flags if needed
test/unit/ears.test.ts                   NEW pattern matrix
test/property/ears.test.ts               NEW fast-check on classifier
lawbook/specs/**                         dogfood EARS rewrites
docs/standards/lawbook.md (+ README)     document Needs: ptest + EARS
```

## Risks

- Over-strict vague list → tune list; keep severity warn.
- Misclassifying complex vs event → exhaustive fixture table in unit tests.
- `ptest` inferred as `utest` by path only → runner window must win over plain utest glob when patterns match.
- Dogfood churn on large specs → batch by capability; keep ids/revisions stable unless intentionally bumping.
