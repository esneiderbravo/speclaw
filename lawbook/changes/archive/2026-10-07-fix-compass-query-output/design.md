# Design — fix-compass-query-output

Level 3 bug change (human-confirmed). `bugfix.md` holds the symptoms, root
causes (RC1–RC7), and regression tests; this file fixes the shapes and the
module boundaries the implementer must keep. Ships as **2.0.13**.

## Constraints

- **Two transports, one implementation (LAWS §2).** Logic lives in
  `src/modules/*`; `register.ts` and CLI commands stay thin.
- **`src/shared` stays innermost.** `text()` and `applyTextBudget` may not import
  Compass. The find formatter lives in `src/modules/compass/`.
- **Cortex does not import lawbook.** The harness reads `change.json` itself
  (it already does in `readConfirmedLevel`).
- **CLI output is frozen for search.** `HybridSearchResult` keeps its type, and
  `speclaw search|recall` (`--json` and text) keep their shape; the sealed anchor
  `explain-output-includes-ranking-signals` stays valid. Only values change
  where a defect fix requires it (focus filtering).
- **No new dependency.** Token estimates use the existing `estimateTokens`
  (`src/shared/output-budget.ts`, ~4 chars per token).

## 1. MCP find output and the text budget (RC1)

### `text()` opt-in budget

`src/shared/mcp.ts`:

```ts
export type TextBudget = OutputMode | { maxTokens: number };
export function text(value: unknown, budget: TextBudget = "brief")
```

- `"brief"` / `"full"` behave exactly as today (`OUTPUT_BUDGET`).
- `{ maxTokens }` caps at that many tokens. Callers that already fitted their
  payload (the find formatter) pass the same cap, so `text()` is a no-op safety
  net for them.
- `applyTextBudget(text, mode)` gets the matching overload and a mode-aware
  suffix: under `brief` the suffix keeps today's
  `… [truncated — use mode:"full" or narrow includes]`; under `full` or an
  explicit `maxTokens` the suffix is `… [truncated — narrow includes or the
  query]` and never names `mode:"full"`.
- The ~32 other call sites are untouched.

`compass_explore` → `text(formatExploreRich(result, mode), mode)`;
`compass_diff_context` → `text(formatDiffContext(result, mode), mode)`.

### MCP find response

New `src/modules/compass/find-output.ts` exporting
`formatFindResponse(result, opts): string` (returns the exact text to emit) and
the response type. Used by `compass_find`, `compass_search`, and
`compass_recall` (aliases keep their deprecation prefix inside the budget).

```ts
interface FindHit { name: string; kind: string; file: string; line: number }
interface FindResponse {
  mode: "exact" | "concept";
  found?: boolean;          // exact mode only
  terms?: string[];         // exact mode only, every call
  rendered: string;
  hits: FindHit[];
  nearest?: FindHit[];      // exact mode, found === false only (≤ 5)
  focus: string[];          // indexed focus actually used
  focusIgnored?: string[];  // present when non-empty
  degraded?: string[];      // present when non-empty
  termsTotal?: number;      // length of terms before trimming, only when trimmed
  focusTotal?: number;      // length of focus before trimming, only when trimmed
  focusIgnoredTotal?: number; // length of focusIgnored before trimming, only when trimmed
  tokens: number;           // estimateTokens(emitted text)
  budget: number;           // the cap applied
  truncated?: true;         // present only when content was removed to fit the cap
}
```

No `nodeId`, `signature`, `signals`, or `route` in the MCP response. The input
schema of `compass_find` does not change (no `explain`).

Budget algorithm (deterministic):

1. `cap = maxTokens ?? OUTPUT_BUDGET.brief` (1500). `findSymbols` calls
   `hybridSearch` with `maxTokens: cap` so `rendered` is fitted first.
2. Serialise with `JSON.stringify(response)` (no indentation, so every token
   carries content).
3. While `estimateTokens(text) > cap`, remove content in this order (each step
   sets `truncated: true`):
   1. **Context lists first.** `focusIgnored`, then `focus`, then `terms` are
      trimmed from the end, each to the longest leading prefix that fits
      (binary search) or to empty; a trimmed list reports its original length
      in `focusIgnoredTotal` / `focusTotal` / `termsTotal`. These lists are
      unbounded inputs (every changed file of the worktree, every identifier of
      the query) and matter less than the payload, so no hit is dropped while
      any of them still holds an entry.
   2. Drop the lowest-ranked hit from `hits` **and** its block from `rendered`
      (re-render the kept hits).
   3. When one hit remains and the text is still over, shorten `rendered`
      (TreeContext elision) or empty it.
   4. Drop `nearest` (≤5 compact entries) from the end.
   5. Last resort (an alias prefix plus one hit still over the cap): drop the
      last hit.

   The document therefore fits every cap the input schema accepts (≥ 256) and
   always parses as JSON.

   `truncated: true` is also set when the search itself left ranked
   candidates out: `hybridSearch` fits its hits to the same cap, so
   `result.capped` (ranked count > returned hits) carries into the response.
   `truncated` therefore means "content was removed to fit the cap (search fit
   or formatter)", never "the formatter alone trimmed".
4. `tokens` is written last: recompute until the digit count is stable (at most
   two passes), so `tokens === estimateTokens(text)` holds exactly.
5. The result is passed to `text(str, { maxTokens: cap })`, which never trims
   it.

## 2. Indexed focus (RC2)

`src/modules/compass/hybrid.ts`:

```ts
export interface ResolvedFocus { focus: string[]; ignored: string[] }
export function resolveSearchFocus(db, projectPath, focus?: string[]): ResolvedFocus
```

- Explicit focus: normalise each path (trim, strip `./`, `\` → `/`, absolute
  under the root → repo-relative), de-duplicate, keep those present in `files`;
  `ignored` lists the dropped inputs as given.
- No explicit focus in a git repo: `worktreeChangedFiles` filtered the same way.
  Non-git: `{ focus: [], ignored: [] }`.
- `hybridSearch` gains an internal option `resolvedFocus?: ResolvedFocus`. When
  absent it calls `resolveSearchFocus` itself (CLI path: filtered `focus`, no
  `focusIgnored` field). `findSymbols` resolves first, passes `resolvedFocus`,
  and copies `ignored` into the MCP response as `focusIgnored`.
- `defaultBudget(hasFocus)`, the route, and PageRank personalization use the
  filtered list; an empty filtered list means the no-focus defaults (uniform
  personalization).
- `resolveFocus` stays exported as a thin wrapper returning `.focus` if any
  caller still needs it; `git.ts` and `diff-context.ts` are not changed.

## 3. Exact mode semantics (RC3)

Exact mode is decided in `findSymbols` with one internal `hybridSearch` option;
concept mode and the CLI are unchanged.

- **Terms.** Split the query on whitespace, commas, `|`, and `;`; keep tokens
  that look like identifiers (`[A-Za-z_$][\w$.]*`); de-duplicate in order.
  `terms` is reported on every exact-mode response.
- **Exact hits.** `hybridSearch(..., { exactNames: terms })` adds a name list of
  `name IN (terms)` (file-owner nodes excluded) and, after fusion and ranking,
  keeps only candidates whose name equals a term (case-sensitive). The FTS AND
  query no longer gates them, so `alpha beta` returns both. Ranking among exact
  hits keeps the existing fusion + PageRank order. `rendered` is fitted over
  the kept hits only.
- **Not found.** No exact hit → `found: false`, `hits: []`, `rendered: ""`,
  and `nearest` (≤5, de-duplicated by node id, file-owner nodes excluded) in this
  order:
  1. indexed names contained in a term, length ≥ 3, longest first
     (`RequestDetail` for `RequestDetailScreen`);
  2. case-insensitive equality, then shared camelCase/snake subtokens
     (most shared subtokens first);
  3. KNN neighbours from the vector list, last.
- **Found.** `found: true` with the exact hits; no `nearest`.
- The canonical `req~compass-mcp-surface~1` sentence "mode SHALL only adjust
  fusion weights" is amended in the delta spec.

## 4. `ref` edges and schema 12 (RC4)

### Extraction (`extract.ts`)

- `ExtractedRef.kind`: `"call" | "import" | "ref"`.
- TS/TSX: `type_annotation` subtrees (parameters, variables, properties, return
  types), `extends_clause`/`implements_clause` of classes,
  `extends_type_clause` of interfaces. JS: `class_heritage` `extends`.
  Each `type_identifier`/`identifier` inside (including generic arguments)
  becomes a ref named for that identifier; for a qualified `ns.Type`, name
  `Type` with `is_member = 2` and `spec` set when `ns` is an import binding,
  otherwise `is_member = 1`.
- Owner: the enclosing definition, else the file-owner node.
- De-duplicate per `(owner node, name)`; built-in type names (`string`,
  `number`, `Array`, `Promise`, `Record`, …) are not emitted.
- Whether `callNode` covers `new_expression` is out of scope (unchanged).

### Resolution (`resolveEdges`, full index and per-file reindex)

For `kind = 'ref'`, in order: existing `dst_node_id`; the name is an import
binding of the same file whose import resolved to a project file → the
definition in that target (barrel rules as for calls); a definition with that
name in the same file. Otherwise `dst_node_id` stays NULL. A ref never
resolves by a bare global name, and the by-name fallbacks of explore callers
and of impact SHALL NOT match `ref` edges. Per-file reindex uses the same
rules (`req~reindex-on-edit~1` "Resolution matches a full index" includes
refs).

### Readers

- `explore(projectPath, query, opts?: { includeRefs?: boolean })` — default
  `false` (callers from `kind = 'call'` only, as today), so
  `lawbook/investigate.ts` and `lawbook/levels.ts` are unchanged.
  `exploreRich` (MCP `compass_explore`) and the CLI `speclaw explore` pass
  `true` (LAWS §2 twin).
- With refs on, each caller entry carries `via: "call" | "ref"`; one entry per
  caller node, `via: "call"` when that caller has both kinds.
- `impact` default kinds stay `call`+`import`; affected tests, diff context,
  PageRank, hotspots, coupling (`in_graph`), map, and visualize keep their
  `call`/`import` filters. Audit every `FROM edges` query: one with no kind
  filter gets an explicit `kind IN ('call','import')` (or `= 'call'` where that
  was the intent).

### Schema 12 (`db.ts`)

- `SCHEMA_VERSION = "12"`. No column change (`edges.kind` is TEXT).
- `migrate11to12`: inside one `BEGIN IMMEDIATE`, set the needs-reindex marker
  with a reason naming schema 12 and stamp `"12"`; on failure roll back and keep
  `"11"`. A `"10"` database runs `migrate10to11` then `migrate11to12`; the
  pre-release schema-11 (no `edges.spec`) path runs its step then 11→12.
- The next index re-extracts every file; `embedding_cache` rows are reused
  (embedder input does not include edges).
- speclaw ≤ 2.0.12 sees `"12"` as unknown and rebuilds from scratch: docs say to
  pin every speclaw (and the MCP entry) to 2.0.13.

## 5. Unconfirmed bug drafts (RC5)

`scaffoldBugfix`: `level: opts.level` (no fallback). `scaffoldChange` already
writes an unconfirmed record (`proposal` + `changeType`) when `level` is
`undefined`. Artifacts when unconfirmed: `bugfix.md` + `tasks.md` (today's
level-1 set; no `design.md`, so the `req~feature-draft~1`/"Bugfix change type"
scenario "proposal.md and design.md SHALL NOT exist" still holds).
`bugfixTemplate` header prints `**Level:** unconfirmed` when no level was
supplied. Validate applies level-3 bug rules until `level set` (so it reports
the missing `design.md`), which is the full-ceremony default. A supplied
`--level` / `level` is still recorded as confirmed (same rule as feature drafts).

## 6. Harness guards (RC6)

`src/modules/cortex/harness.ts`:

- `advance` and `rework` start with
  `const level = readConfirmedLevel(projectPath, change)` (unconfirmed or
  missing → 3) and use it for routing and for `state.level` in the written
  state. `status` stays read-only and reports the stored state.
- Pause: `if (args.pauseForQuestions)` is evaluated **before** any routing:
  stage `planning` → existing behavior (questions required, stage
  `questions`); any other stage → throw
  `pauseForQuestions is only valid from stage planning (current: <stage>)`
  with no write. `openQuestions` without `pauseForQuestions` keeps today's
  behavior.
- The CLI (`speclaw cortex advance --pause-questions`, `lawbook harness` alias)
  surfaces the error and exits non-zero.
- `brief.ts` already lists `pauseForQuestions` only for planning.

## 7. Proposal preservation (RC7)

`src/modules/lawbook/levels.ts` and `quick.ts`:

- `CeremonyDegraded` gains `"no-targets"`. `gatherSignals` adds it when
  `targets.paths` and `targets.symbols` are both empty; `proposeLevel` returns
  `level: null`, `score: 0`, rationale ending `→ level none` for it.
- `handleLevel`: compute a fresh proposal only when the call has targets.
  - `propose`/`explain` with no targets → the `no-targets` proposal.
  - `set` with no targets → reuse the stored proposal fields (`level`, `score`,
    `signals`, `rationale`, `degraded`) when `change.json` exists, else the
    `no-targets` proposal; the "lower than proposed needs a reason" rule uses
    that effective proposal.
  - `promote` with targets → `promoteCeremonyLevel` also stores the fresh
    proposal fields; without targets → the stored proposal is untouched (today's
    behavior, now explicit and tested).
- `scaffoldChange`'s `level < proposal.level` check is unaffected
  (`proposal.level` null skips it).

## Version and docs

- 2.0.13 following commit f3d5d3b (`chore(release): bump to 2.0.12`):
  `package.json`, `package-lock.json`, `CHANGELOG.md`, plus a `2.0.13` entry in
  the `src/cli/commands/update.ts` migration notes (schema 12, pin to 2.0.13,
  find response shape, `via` on explore callers).
- `docs/compass.md`, `src/modules/foundation/assets/docs/compass.template.md`
  (keep `{{…}}` and `speclaw init` markers), `CLAUDE.md`, `AGENTS.md`:
  schema 11 → 12 notes. `CLAUDE.md` and `AGENTS.md` are strict lock paths: the
  **human** runs `speclaw laws accept CLAUDE.md` and
  `speclaw laws accept AGENTS.md` on an interactive TTY; no agent does.
- `docs/cortex.md`: pause only from `planning`; level re-read on advance.

## Risks

- Edge totals and some exact-count assertions in tests move with `ref` rows.
- Empty-target proposals become `level: null`; tests that asserted level 0 for
  an empty target set change on purpose.
- Schema 12 forces one full re-extract per project on upgrade (embeddings
  reused); mixed speclaw versions rebuild from scratch.
- Exact-mode ranking among several exact hits (overloads, same name in many
  files) keeps fusion order; PageRank still breaks ties.
