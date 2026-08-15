# add-graph-law-engines — the first deterministic law backends

## Why

`check-dispatcher` shipped the enforcement mechanism but only one verification
backend: `path` (pure glob matching). Every architectural law a project actually
cares about — "the domain does not depend on infrastructure", "no feature imports
another feature", "no dependency cycles" — is declared in the manifest, reported
by `doctor` as *"declared, no backend yet"*, and then ignored at runtime. The
`speclaw_check` hot path can gate a keystroke by *where* a file lives, but it
cannot answer *what depends on what*. That question is exactly what the Compass
index already holds.

This change gives speclaw its first two deterministic engines that read the graph
— `deps` (file/import-level rules) and `graph` (dependency cycles and symbol
reachability) — plus the batch verification surface (`law_verify`) that runs them
and reports a result honest enough to trust: passed / failed / **skipped** /
**unknown**, never a silent "ok" because it did not look. It is the first slice
of the `executable-laws` roadmap piece.

Authority note: the scope and the five design decisions below follow
[`docs/roadmap/02-correcciones-verificadas.md`](../../../docs/roadmap/02-correcciones-verificadas.md)
§6–§7, which correct the feature doc
[`docs/roadmap/runtime/executable-laws.md`](../../../docs/roadmap/runtime/executable-laws.md)
on five verified points against `main`:

1. **Engines live in `foundation`, not a new `src/modules/laws/`.** A new module
   would create a latent cycle: the `Stop` hook runs architecture laws via
   `speclaw_check` (in `foundation/check.ts`), which would have to call the batch
   in `laws`, which imports the model from `foundation` → `foundation → laws →
   foundation`. Verified: `compass` does not import `foundation`, so
   `foundation → compass` is a clean, acyclic dependency. If `foundation` later
   grows too large, extraction happens by dependency inversion at the entrypoint,
   never by a direct import.
2. **Laws are authored in a committed `lawbook/laws/*.json` directory, not a
   fenced block inside `docs/standards/*.md`.** Verified: `src/shared/render.ts`
   is 30 lines of `/\{\{([a-z_]+)\}\}/g` substitution — it does not process
   markdown, does not strip fenced blocks, and there is no interception point;
   the agent `Read`s standards files directly. (Law authoring itself is a later
   slice; this change only fixes the stale claim in the feature doc.)
3. **The `process` engine needs no new git plumbing** — `src/shared/git-history.ts`
   already exposes `logForPath(projectPath, relPath, {since, until})`. (Out of
   scope here; noted so a later slice does not re-invent it.)
4. **`graph` vs `deps` is decided, not left open:** `deps` carries
   dependency-cruiser-style file/import `from`/`to` rules; `graph` carries cycles
   (Tarjan) and symbol reachability. Both names are already frozen in the public
   `VerificationKind` enum, so the split is committed now.
5. **No tool count is pinned in prose, and `SCHEMA_VERSION` is not touched.** The
   count is read from `speclaw doctor`; this slice adds no table and no schema
   bump.

## What

- **Model extension in `src/modules/foundation/laws.ts`.** Widen
  `Verification` from `{ kind }` to a discriminated union that carries a rule
  payload for `deps` (`DepsRule`: `from`/`to` regex-on-path, `type:
  forbidden|required`, group matching, `circular`/`reachable` flags reserved for
  `graph`) and `graph` (`GraphRule`: `circular` and `reachable`). `path`, `none`,
  and the still-unimplemented kinds stay `{ kind }`-only. Validated with the
  existing `zod`; the model is **extended, never rewritten** (its header says so).
- **A batch verifier** `verifyLaws(args)` in a new `src/modules/foundation/verify.ts`,
  returning a `VerifyReport` whose `summary` distinguishes **four** states —
  `passed`, `failed`, `skipped`, `unknown` — plus a `skipped[]` list that always
  carries a machine-readable reason and an `unknown[]` list for findings computed
  over unresolved edges. No code path converts a skip into a pass.
- **The `deps` engine** (`src/modules/foundation/deps.ts`): file-granularity
  `from`/`to` rules evaluated as SQL over the existing `edges`/`nodes`/`files`
  tables — no new table. Resolves `dst_node_id → nodes.file_id`; supports
  `type: forbidden` and `type: required`, and group matching (`$1`).
- **The `graph` engine** (`src/modules/foundation/graph.ts`): dependency cycles
  via **iterative** Tarjan returning the **minimal** cycle inside a large SCC (not
  the whole component), self-loops reported separately as `info` not a cycle
  violation, and symbol `reachable` checks.
- **Unresolved edges are a first-class `unknown`.** An `edges.dst_node_id IS NULL`
  inside a law's scope is *not* "does not violate" — it is *unknown*, counted in
  `summary.unknown` and named in the report, never silently in `passed`.
- **One new MCP tool** `law_verify(projectPath, paths?, engines?, lawIds?)`, with a
  ≤30-word description, and its CLI twin `speclaw laws verify` (the architecture
  law "two transports, one implementation" requires both). Both delegate to the
  same `verifyLaws` core.
- **`doctor`** learns to report the graph engines' availability (index present or
  not) alongside the existing "declared, no backend yet" line, which now covers
  only the still-unimplemented kinds.
- **Feature-doc alignment:** correct the stale facts in
  `docs/roadmap/runtime/executable-laws.md` §3.1/§3.2/§3.3 and its DoD counts so
  the doc matches `main` (model lives in `foundation`; `SCHEMA_VERSION` already
  `"4"`; `render.ts` strip is not real; tool counts defer to `doctor`).

## Non-goals

- **The `ast` backend, `@ast-grep/napi`, and its `optionalDependencies` /
  degradation** — its own later slice.
- **The known-violations baseline** (`lawbook/known-violations.json`, fingerprint,
  `--update`/`--prune`) — its own later slice, and the mechanism of adoption, so
  it gets full attention on its own.
- **The markdown/`lawbook/laws/*.json` authoring surface and any parser** — laws
  are still seeded as an asset in this slice; `law_verify` runs against the
  manifest that already exists.
- **The `process`, `traceability`, and `semantic` backends.**
- **`law_findings` cache and any `SCHEMA_VERSION` bump.** The `deps`/`graph`
  engines query the existing schema live; caching is deferred with the `ast`
  slice that first needs it. If a later slice needs the bump, it reads
  `SCHEMA_VERSION` from `src/modules/compass/db.ts` live and adds one.
- **The action-time hot path is unchanged.** `checkAction` (PreToolUse/
  PostToolUse/Stop) keeps evaluating `path` only; the graph engines are
  batch-only by design, so no SQL ever runs on the keystroke latency budget.

## Migrations

None. Additive: a new tool, a new batch surface, and a backward-compatible model
extension (existing `{ kind: "path" }` manifest entries validate unchanged). No
schema bump, no data migration. `law_verify` skips `deps`/`graph` laws with reason
`no-index` when a project has never run `compass_index`, so the feature is inert
until a graph exists rather than failing.
