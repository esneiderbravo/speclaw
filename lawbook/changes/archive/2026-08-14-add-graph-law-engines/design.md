# Design — add-graph-law-engines

## Approach

Two deterministic engines that read the Compass graph, plus a batch surface that
runs them. Everything lands in the existing `foundation` module; nothing new is
created under `src/modules/`.

```
src/modules/foundation/
  laws.ts     ← EXTEND: Verification → discriminated union; DepsRule/GraphRule + zod
  verify.ts   ← NEW: verifyLaws(), VerifyReport, four-state accounting, scope filter
  deps.ts     ← NEW: `deps` engine — SQL over edges/nodes/files, from/to, group match
  graph.ts    ← NEW: `graph` engine — iterative Tarjan, minimal cycle, reachability
  register.ts ← EXTEND: register law_verify (≤30-word description)
  doctor.ts   ← EXTEND: report graph-engine availability (index present?)
src/cli/commands/
  laws.ts     ← NEW: `speclaw laws verify` — the CLI twin, thin
```

`verify.ts` imports `compass/db.ts` (`openDb`, `indexExists`) to read the graph.
`deps.ts` and `graph.ts` receive an open DB handle and the scoped law set; they
never open the DB themselves, so `verifyLaws` owns the single "is there an index?"
decision and the `no-index` skip.

### The two evaluation surfaces, one model

`check-dispatcher` left `hasBackend()` / `IMPLEMENTED_BACKENDS = ["path"]` gating
the **action-time** hot path (`checkAction`) to glob matching only. That stays
exactly as is. This change introduces a separate `BATCH_BACKENDS = ["deps",
"graph"]` consumed only by `verifyLaws`. The two surfaces share the `Law` model,
the `zod` schema, and `compileScope`/`matchCompiled` — but their backend sets are
deliberately different:

- **action-time** (`speclaw_check`, PreToolUse/PostToolUse/Stop): `path` only, so
  the p99 < 15 ms latency budget is never spent on a SQL query.
- **batch** (`law_verify`, invoked by the `Stop` hook and by CI later): `deps` +
  `graph`, which need the index.

This is the honest reading of the `executable-laws` §7 "one evaluator" risk: the
risk it names is *two implementations of the same check drifting*. We have one
model and one scope matcher; we have two surfaces because latency and I/O
constraints genuinely differ, not because the check is duplicated. `verify.ts` is
the single home of graph evaluation; `check.ts` never grows a graph path.

### Data model

`Verification` becomes a discriminated union on `kind`:

```ts
type Verification =
  | { kind: "path" }
  | { kind: "deps"; rule: DepsRule }
  | { kind: "graph"; rule: GraphRule }
  | { kind: "ast" }        // declared-only, later slice
  | { kind: "process" }    // declared-only, later slice
  | { kind: "traceability" } | { kind: "semantic" } | { kind: "none" };
```

`DepsRule` mirrors dependency-cruiser (`from`/`to` as **regex on POSIX path**,
`type: "forbidden" | "required"`, group matching via `$1`). `GraphRule` carries
`circular?: boolean` and `reachable?: boolean`. Both are validated by the
manifest's existing `zod` schema, including that `from`/`to` compile as regexes —
a bad pattern fails at manifest validation, never at verify time. Existing
`{ kind: "path" }` entries validate unchanged (the union's `path` arm is
payload-free), so no migration and no re-seed.

### `deps` engine

Two SQL shapes over the real schema (`edges.dst_node_id → nodes.file_id → files.path`):

- **resolved edges** (`WHERE e.dst_node_id IS NOT NULL`) → the from/to matcher's
  input; `forbidden` emits a finding per match, `required` emits a finding per
  `from` file with no matching `to` edge.
- **unresolved edges** (`WHERE e.dst_node_id IS NULL`) inside scope → counted in
  `summary.unknown` with the law id and the count. An unresolved edge is *unknown*,
  not *clean*; conflating them produces silent false negatives (feature-doc §3.9).

Group matching: a capture group in `from`'s regex is substituted into `to`'s
pattern as `$1` before matching, turning "no feature imports another feature" into
one rule.

### `graph` engine

Iterative Tarjan (explicit stack) from the start — a recursive SCC pass overflows
on deep import chains, and rewriting it after a monorepo bug report is far more
expensive than writing it iterative once. For each SCC of size > 1, a BFS
restricted to the component finds the **minimal** return cycle; the finding lists
that cycle and reports the enclosing SCC size as detail (a 40-file component is
not actionable; the 3-file cycle inside it is). Size-one SCCs with a self-edge are
recursion, reported separately as `info`.

### Transports

`law_verify` (MCP) and `speclaw laws verify` (CLI) are both thin: validate/parse,
call `verifyLaws`, shape the result with `text()` (MCP) or terminal output (CLI).
The architecture law "two transports, one implementation" requires the CLI twin;
omitting it would violate a law this repo enforces on itself.

## Alternatives weighed

| Decision | Alternative | Why rejected |
| :-- | :-- | :-- |
| Engines in `foundation` | New `src/modules/laws/` module | Creates the latent cycle `foundation → laws → foundation` (the `Stop` hook runs architecture laws via `foundation/check.ts`, which would call the batch in `laws`, which imports the model from `foundation`). Also forces amending the `architecture.md` module table — itself a law, i.e. another spec change. Verified acyclic: `compass` does not import `foundation`. If `foundation` outgrows itself later, extract by **dependency inversion at the entrypoint** (`laws` exposes `verifyLaws`, `check.ts` receives it injected, `server.ts` wires it), never a direct import. |
| `deps` = file/import rules, `graph` = cycles + reachability | Fold both into one `graph` kind | The `VerificationKind` enum already froze **both** names publicly in `check-dispatcher`; collapsing them is a breaking change to a shipped contract. Keeping them split now costs nothing and matches how developers already think (dependency-cruiser `from`/`to` vs graph cycles). |
| Separate `BATCH_BACKENDS`, hot path unchanged | Add `deps`/`graph` to `IMPLEMENTED_BACKENDS` | `checkAction` would then try to run graph queries on the PreToolUse latency budget — the exact thing the 15 ms test guards against, and the graph engines are `gate`, not `bloqueo`, so they never belong on the keystroke anyway. |
| Author-surface deferred; still seed as asset | Parse laws from `docs/standards/*.md` now | `render.ts` does not strip fenced blocks and there is no interception point (verified: 30-line `{{var}}` regex). Authoring is its own slice; verifying the manifest that already exists delivers the engines without coupling to an unbuilt parser. |
| No `SCHEMA_VERSION` bump, no `law_findings` cache | Add the cache table now (feature-doc §3.8) | The `deps`/`graph` queries are cheap over the existing index; the cache only pays off once the `ast` engine re-parses files. Six roadmap docs assume "3"→"4" and the repo is already at "4"; whoever bumps first reads it live and adds one. Not this slice. |

## Trade-offs and risks

- **Graph resolution is ~90%, not 100%.** tree-sitter leaves some edges
  unresolved. Mitigation: `unknown` is a first-class state, and `deps`/`graph`
  laws are `gate` (a PR comment), never `bloqueo` (a keystroke) — a false positive
  costs a comment, not an uninstall.
- **Growing `foundation`.** This adds four files to an already central module. The
  documented escape hatch (dependency inversion at the entrypoint) is written down
  above so the next slice has a non-cyclic path if extraction is ever warranted.
- **`required` rules can be expensive** on large graphs (every `from` file checked
  for absence of a `to` edge). Kept file-granular and index-backed; node-level
  rules are explicitly out of scope.
