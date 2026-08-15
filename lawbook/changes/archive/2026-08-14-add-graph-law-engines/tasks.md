# Tasks — add-graph-law-engines

- [x] **Step 0: Create the feature branch (must be first).** `feat/graph-law-engines`.

## Model
- [x] Extend `Verification` in `src/modules/foundation/laws.ts` to a discriminated
      union on `kind`; add `DepsRule` (`from`/`to` regex-on-path, `type:
      forbidden|required`, group matching) and `GraphRule` (`circular`, `reachable`).
- [x] Extend the manifest `zod` schema: validate the `deps`/`graph` payloads,
      compile `from`/`to` as regexes at validation time (reject bad patterns with the
      law id + field, via `superRefine` + `regexError`), and keep `{ kind: "path" }`
      (and the other payload-free kinds) validating unchanged. Added
      `BATCH_BACKENDS = ["deps","graph"]` + `hasBatchBackend`; left
      `IMPLEMENTED_BACKENDS` / `hasBackend` (the action-time gate) untouched.

## Engines
- [x] `src/modules/foundation/deps.ts`: SQL over `edges`/`nodes`/`files` resolving
      `dst_node_id → file`; `forbidden` and `required`; group matching (`$1`);
      findings carry law id + source path + source line; unresolved edges
      (`dst_node_id IS NULL`) in scope collected as `unknown`.
- [x] `src/modules/foundation/graph.ts`: **iterative** Tarjan SCC; minimal cycle
      inside a component with the SCC size as detail; `reachable` checks.
      **Spec refinement:** at file granularity an intra-file self-edge is not a
      cycle — it is excluded from the graph rather than reported as a noisy `info`
      (the roadmap's node-level self-loop idea does not apply file-granularly). The
      delta spec's graph scenario was updated to match, not silently diverged.

## Batch surface
- [x] `src/modules/foundation/verify.ts`: `verifyLaws(args)` — owns the single
      `openDb`/`indexExists` decision and the `no-index` skip; scope-filters laws;
      dispatches `deps`/`graph`; builds `VerifyReport` with a four-state `summary`
      (`passed`/`failed`/`skipped`/`unknown`), a `skipped[]` with machine-readable
      reasons, and an `unknown[]`. No code path turns a skip/unknown into a pass.
      Honors optional `paths`, `engines`, `lawIds` filters.
- [x] Register `law_verify` in `src/modules/foundation/register.ts` (21-word
      description; delegates to `verifyLaws`).
- [x] `src/cli/commands/laws.ts`: `speclaw laws verify` CLI twin, thin, delegating
      to the same `verifyLaws` core (two transports, one implementation); wired into
      `src/cli/index.ts` dispatch + HELP.
- [x] Extend `doctor.ts`: report graph-engine availability (index present or the
      command to build it); the "declared, no backend yet" line now covers only the
      still-unimplemented kinds (`ast`/`process`/`traceability`/`semantic`).
      (Regex validation lives at manifest validation, not `doctor`: a bad regex is
      rejected by the schema `superRefine`, so it never reaches `doctor`.)

## Feature-doc alignment (authority: docs/roadmap/02-correcciones-verificadas.md)
- [x] Correct the stale facts in `docs/roadmap/runtime/executable-laws.md`:
      §3.1 (`SCHEMA_VERSION` already `"4"`, module is `foundation` not a new `laws/`,
      tool counts → `speclaw doctor`), §3.2 (extend the `foundation` model, do not
      create `src/modules/laws/model.ts`), §3.3 (`render.ts` does not strip fenced
      blocks; laws are authored in `lawbook/laws/*.json`), and the §5 DoD counts.

## Mandatory gates
- [x] Review and update the affected tests (extended the `register.ts` contract test
      for `law_verify` + a description-length assertion; the tool count is read from
      the registry, not pinned).
- [x] Add tests: `test/unit/laws.test.ts` (model union + payload validation +
      legacy `path` compat + malformed-regex rejection naming the law id),
      `test/unit/deps.test.ts` (forbidden/required, group matching `$1`,
      unresolved-edge → unknown, `paths` filter), `test/unit/graph.test.ts`
      (iterative Tarjan on an 8,000-node chain that would overflow a recursive impl,
      minimal cycle in a large SCC, intra-file self-edge is not a cycle, reachable),
      `test/integration/verify.test.ts` (fixture with `deps` + `graph` laws: full
      verify, `paths`/`engines`/`lawIds` filters, no-index skip, four-state `summary`
      shape, inert `ast` law).
- [x] Run the quality gates and verify they pass: `npm run check`, `npm run build`,
      `npm test` — all green; 200 tests pass; coverage 97.84% lines / 89.58% branches
      / 97.01% functions (new files: deps 99.15, graph 99.54, verify 97.22, laws 98.60
      lines) — above the 80% floor. See reports/backend.md.
- [x] Perform manual verification (agent-run): built a throwaway `mktemp -d` repo
      with a `domain → infra` dependency, indexed it with the real `speclaw index`,
      ran `speclaw laws verify` → real finding `src/domain/order.ts:3 → src/infra/http.ts`;
      confirmed no-index skip on the un-indexed repo. Isolated, removed after.
- [x] Produce the discipline reports under `reports/` (`backend.md`, `api.md` — a
      new MCP tool is an API surface).
- [x] Update the technical documentation touched by the change (README Foundation
      row: the deterministic `deps`/`graph` engines and the four-state report).
- [x] Bump the version to 0.3.3 per the roadmap-piece build cadence.
- [x] Archive the change within the same PR (`lawbook:archive`).
