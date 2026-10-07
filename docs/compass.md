# Compass — code intelligence for agents in speclaw

**Compass** is speclaw's local code graph: a pre-indexed map of every symbol
(node) and relationship (edge) in this workspace, plus a local vector store for
semantic recall. Agents **MUST** call Compass first for any code question —
before any `grep`/`sed`/`cat`/Read, and before opening a file whose name they
already know. Manual file tools are a fallback used **only after** a Compass
call returns nothing useful, the graph is missing, or the target isn't indexed
code (stylesheets, config, logs). This is Rule 1 of the agent contract
(`AGENTS.md`).

It runs entirely on your machine, needs no LLM and no external service, and
stores everything in `.speclaw/` (gitignored). It ships inside speclaw — there
is nothing extra to install.

## Why use it

| Without Compass | With Compass |
|-----------------|--------------|
| Many `Grep` + `Read` round-trips (tokens spent scanning) | One `compass_explore` call returns source, callers, callees, blast radius, tests, hotspot |
| Guess which file matters | `compass_find` (mode: concept) finds code by meaning |
| Edit without knowing the blast radius | `include: ["blast_radius"]` on explore, or `compass_diff_context` for a diff |
| Whole files dumped into context | verbatim source of the node + its neighbors only |

The point is token economy: the agent gets exactly the code it needs to answer
a request, not whole files.

## The tools (nine canonical MCP tools across the suite)

| Tool | Use it to |
|------|-----------|
| `compass_index` | Build/refresh the graph (`.speclaw/index.db`); optional watch actions (`start`/`stop`/`status`). Schema **12** adds type-reference (`ref`) edges (11→12 migrates and forces one full re-extract; embedding cache reused). Schema 11 added `edges.is_member`, `edges.spec`, and hidden file-owner nodes. Schema 10 added FTS5 `nodes_fts` + `node_text` + `pagerank`. Also: `embedding_cache`, Merkle, `node_metrics`, test/module flags. |
| `compass_explore` | Read a node's source plus callers, callees, blast radius, affected tests, and hotspot — in one call. `node` may be a symbol name or a repo-relative file path. Use `to:` for trace-style paths. See [Callers, callees, and affected tests](#callers-callees-and-affected-tests). |
| `compass_find` | **Hybrid** search always: BM25 + vectors + name match → RRF → task-relative rank. `mode: concept` is dense-heavy and fuzzy; `mode: exact` is sparse/name-heavy and keeps only symbols named exactly a query term. Optional `focus` / `maxTokens`. See [The compass_find response](#the-compass_find-response). |
| `compass_diff_context` | Graph context for a change set (working tree, git rev, or explicit paths): symbols touched, blast radius, tests (same `command` contract as explore), hotspots. |
| `cortex` | CORTEX — multi-agent loop brain (*One brain. Many agents.*). Actions: `status` \| `start` \| `advance` \| `rework` \| `brief`. Also CLI `speclaw cortex`. |
| `lawbook_change` | Lawbook lifecycle: init, list, draft, validate, sync, archive, level, coverage, drift. `draft` scaffolds a change (`change`, optional `level`, optional `bug`); CLI twin `speclaw lawbook draft <name> [--level N] [--capability C] [--json]` (`--bug` for bug changes). |
| `lawbook_investigate` | Graph-backed bug RCA (stack trace or symptom). |
| `speclaw_setup` | Project setup: init, configure-agent, add-pack, list-packs. |
| `speclaw_check` | Evaluate an action against the laws (hook surface); also carries the Compass-first nudge on `PostToolUse` Read/Grep/Glob. |

Retired names (`compass_search`, `compass_recall`, `compass_impact`, …) remain
as deprecated aliases for one release cycle. Prefer the canonical tools above.
CLI-only: `speclaw index`, `explore`, `search`/`recall` (hybrid; `--focus` `--max-tokens` `--explain`), `impact`, `trace`,
`affected-tests`, `hotspots`, `coupling`, `diff-context`, `visualize`, `scaffold`,
`doctor`, `laws verify`. Requires **Node ≥22.16** for FTS5 (soft-degrades without it).

If the graph is missing (no `.speclaw/index.db`), run `compass_index` first —
a missing graph is not license to skip Compass. Under Claude Code an existing
index is also refreshed when each session starts (see
[Session-start refresh](#session-start-refresh-hooks)) and after each file an
agent edits (see [Reindex on edit](#reindex-on-edit-hooks)); the first build is
always explicit. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

## The compass_find response

`compass_find` (and the deprecated `compass_search` / `compass_recall`
aliases) returns one JSON document, never pretty-printed and never cut
mid-string:

```json
{"mode":"exact","found":true,"terms":["alpha","beta"],"rendered":"# src/a.ts\n1| export function alpha() {",
 "hits":[{"name":"alpha","kind":"function","file":"src/a.ts","line":1}],
 "focus":["src/a.ts"],"tokens":95,"budget":1500}
```

- **The whole response fits `maxTokens`** (default: the brief ceiling, 1500)
  and `budget` reports that cap. Over the cap `focusIgnored`, `focus`, and
  `terms` are cut from the end first, each reporting its original length in
  `focusIgnoredTotal` / `focusTotal` / `termsTotal`; only then do the
  lowest-ranked hits go, together with their `rendered` blocks; then the last
  block is shortened; then `nearest` entries are dropped. `truncated: true` appears
  only when something was removed to fit the cap (by the search fit or the
  formatter). `tokens` is the estimate of the whole emitted text.
- **Hits are compact:** `name`, `kind`, `file`, `line`. No node ids,
  signatures, ranking signals, or route — use `speclaw search --explain` (or
  `--json`, whose `HybridSearchResult` shape is unchanged) to debug ranking.
- **Exact mode answers "does this name exist".** The query is split on
  whitespace, commas, `|`, and `;` into identifier `terms` (an OR, so
  `alpha beta` returns both). Only symbols named exactly a term are hits
  (`found: true`). When none is, the response has `found: false`, empty
  `hits` and `rendered`, and up to five `nearest` names: names contained in a
  term first (`RequestDetail` for `RequestDetailScreen`), then
  case-insensitive or shared-subtoken matches, then vector neighbours.
- **Focus is indexed files only.** Explicit `focus` and the worktree changes
  used when `focus` is omitted are normalised and kept only when the index has
  the file; the rest are listed in `focusIgnored`. An empty filtered set uses
  the no-focus defaults (budget and uniform personalization).
  `compass_diff_context` still lists every changed file.

## Callers, callees, and affected tests

- **File-owner nodes.** A reference outside any definition — a top-level
  import, or a call inside a `test(...)` callback or an arrow function — is
  owned by a hidden per-file node (`kind: "file"`, named by its repo-relative
  path). It exists for files with such references, files with no symbols,
  and re-export barrels (`export * from "./lib/core"`). It never appears in
  `compass_find`, name lookups, PageRank, `node_text`, embeddings,
  `node_metrics`, hotspots, the compact map, drift anchors, or `totals.nodes`.
  It does appear as a caller (`kind: "file"`) and in blast radius, and
  exploring a declaration-less file's path resolves to it.
- **Type references (`via`).** TS/JS type annotations (parameters,
  variables, properties, return types, generic arguments) and
  `extends`/`implements` clauses are stored as `ref` edges, one per owner and
  type name, built-in types (`string`, `Promise`, `Record`, …) excluded. A
  `ref` resolves only through the file's own import binding (barrel rules as
  for calls) or a same-file definition — never by a bare global name, so a
  `Props` in an unrelated file does not bind. `compass_explore` and
  `speclaw explore` list them among callers: every caller carries
  `via: "call"` or `via: "ref"`, one entry per caller node (`call` wins).
  Nothing else reads `ref` edges: blast radius, affected tests,
  `compass_diff_context`, PageRank, hotspots, coupling, the compact map,
  visualize, and `deps`/`graph` laws are unchanged.
- **Callees** list only references resolved to an indexed node, one entry per
  node. Everything else (builtins, member calls on locals, package calls) is
  summarized as `unresolvedCallees: { count, sample }` (at most 10 names).
- **Member calls.** `items.push(x)` is stored with `is_member = 1` and never
  bound by name to a project symbol called `push`. `this.f()`, `super.f()`,
  and Python `self.f()`/`cls.f()` still resolve. A JS/TS `ns.f()` on an import
  binding of the same file (`is_member = 2`, with the import's specifier in
  `edges.spec`) resolves only when that import resolves to a project file —
  relatively, or through tsconfig/jsconfig `paths`/`baseUrl` — preferring that
  file. An import of a barrel (`index.ts` holding only `export … from`)
  resolves to the barrel, and the call then binds by name, preferring a
  definition under the barrel's directory.
  So `@app/services/user` (a `paths` alias) or `utils` (under `baseUrl`)
  are project code, while `path.parse()` from `node:path` or `_.parse()` from
  `lodash` never binds to a project `parse`. If the alias config is one the
  resolver does not follow (package-form or array `extends`, `tsconfig.*.json`
  siblings), the import stays unresolved and member calls through it are
  treated as package calls.
- **Builtins.** Calls to ambient globals such as `test`, `describe`, `expect`,
  `fetch`, `setTimeout`, and `require` bind only to a definition in the same
  file, or — when the name is explicitly imported and the import resolves
  (`import { fetch } from "./http"`) — in the imported file. The by-name
  fallbacks of callers and blast radius match a builtin name only from the
  definition's own file.
- **Trade-off: method calls on locals and parameters are not bound.**
  `svc.run()` or `this.db.query()` — a receiver that is a local variable, a
  parameter, or a property chain — is a member call, so it produces no caller
  edge for a project method `run`/`query`. Such callers are missing from
  `callers` and from the call arm of blast radius; affected-test selection
  mostly still reaches them through the file-level import arm.
- **Imports** are stored whole (whitespace collapsed; longer than 1024
  characters, the middle is elided and the trailing `from "…"` clause kept),
  so a specifier on a later line still resolves. Bindings are read from the
  full statement before the cap. Non-relative specifiers
  resolve through the nearest `tsconfig.json`/`jsconfig.json`
  `compilerOptions.paths` and `baseUrl` (following relative `extends`; JSON
  with comments is fine; a malformed config only disables aliases under it).
- **Affected-test command.** `command` is a string to run from the repository
  root, or `null` when no test file is reachable — never a command that runs
  nothing. `commandReason` always says why. `commands` lists one
  `{ cwd, command, files }` per package (nearest `package.json`):
  `npx vitest run <files>`, `npx jest --runTestsByPath <files>`, a
  `node --test` script's flags minus coverage flags plus the files (mapped onto
  a compiled-test glob such as `dist-test/test/**/*.test.js`, after
  `npm run pretest`; helpers the glob never runs, such as
  `test/helpers/*.ts` against `*.test.js`, are left out), or
  `npm test -- <files>` for an unrecognized script.
  Several packages compose as `(cd a && …) && (cd b && …)`; non-POSIX shells
  should use `commands`. A package with no `scripts.test` and no vitest/jest
  dependency inherits the runner of the nearest ancestor `package.json` that
  declares vitest or jest (hoisted monorepos). In a `node --test` script,
  value flags keep their value (`--import ./register.mjs`), coverage flags are
  dropped with theirs (`--test-coverage-lines 80`), and a directory argument
  (`test/`) matches every file under it. The default `test` target also
  admits workspace paths (`**/src/**`, `**/test/**`, `**/tests/**`).
- **Upgrading to schema 12: pin every speclaw to 2.0.13.** The first index
  after upgrading migrates 11→12 and re-extracts every file once (embeddings
  reused). speclaw 2.0.12 or older — including an MCP entry pinned at
  `@2.0.12` or a stale global CLI — treats a schema-12 index as incompatible
  and rebuilds it from scratch, dropping the embedding cache; the next 2.0.13
  run then rebuilds it again. Run `speclaw update` so the pinned MCP entry
  moves to 2.0.13, and upgrade any global install.

## Index totals and next step

`compass_index` / `speclaw index` report the delta of the run (`files`,
`nodes`, `edges`, `computed`, `fromCache`, `unchanged`, …) **and** the whole
repository's `totals: { files, nodes, edges }`, so a no-op rerun still shows
how much is indexed. `nextStep` is a one-line hint, e.g. `Index ready: 412
files, 3,180 symbols. Next: compass_find "<concept>" or compass_explore
<symbol> — do not grep.` Both fields are in `--json` output; the human output
prints a `Totals:` line and the hint.

**No-op fast path.** A run without `--force`, `--prune`, or an explicit
`--max-cache-mb` that re-extracts nothing, removes nothing, and finds the
Merkle root unchanged (`rootUnchanged: true`) skips the global
post-processing: the `dir_hashes` rewrite, edge and import resolution,
PageRank, and the embedding-cache touch and eviction. It writes only
`meta.indexed_at` (so `doctor`'s freshness check stays accurate) and does not
rewrite `docs/compass.md` unless its map block is empty. Totals and `nextStep`
are still reported. Any real change runs the full pass and rewrites the map.

## Compass-first enforcement

Three pieces turn "Compass first" from a rule into something speclaw checks.

### The call log — `.speclaw/compass-calls.jsonl`

Every Compass call appends one line `{"at":"<ISO>","tool":"<mcp tool>"}`:

- MCP: every canonical Compass tool (including `compass_index`) and every
  deprecated alias (logged under the alias name).
- CLI twins: `explore`, `search`, `recall`, `impact`, `trace`, `diff-context`
  (logged as `compass_<verb>`) and `index` (`compass_index`).

**Evidence** is `compass_explore`, `compass_find`, `compass_diff_context`, and
the aliases `compass_impact`, `compass_trace`, `compass_search`,
`compass_recall`. `compass_index` and the nudge's own `nudge` entries are
logged but are **not** evidence.

The write is best-effort and never fails the tool. Past 256 KiB the log rotates
to `compass-calls.jsonl.1` (one previous generation kept; concurrent rotations
never demote a fresh log). Readers read at most the last 64 KiB, plus at most
64 KiB of `.1` when the live file does not reach back far enough. The log is
under `.speclaw/`, which `init` gitignores. It is per project: a concurrent
session in the same repo shares it.

The Cortex evidence gate (`compassGate`, see [`cortex.md`](cortex.md)) reads it
when a role leaves `exploring` or `implementing`.

### The Compass-first nudge (hooks)

For hook-capable agents (Claude Code), `init` / `update` always install one
extra hook, even when the project declares no law:

```json
"PostToolUse": [{ "matcher": "Read|Grep|Glob",
  "hooks": [{ "type": "mcp_tool", "server": "speclaw", "tool": "speclaw_check", … }] }]
```

Its `input.payload.tool_input` carries `file_path`, `path`, `pattern`, `glob`,
and `type`. When an agent reads or searches **indexed code** and the call log
holds no evidence call from the last **10 min**, `speclaw_check` returns a
short nudge naming `compass_explore` / `compass_find` with a suggested query
(the Grep pattern, or the file's stem). At most one nudge per **5 min**.

- Eligible: `Read` of an indexed-language file; `Grep`/`Glob` over an indexed
  file, a directory, or the whole repo (no `path`). A Grep whose `glob`/`type`
  limits it to non-indexed files, or a Glob whose pattern names only
  non-indexed extensions (`**/*.md`), is not eligible. Directories are told
  apart from files with one `stat` (so `src/v1.2` is a directory). Targets under
  `node_modules/`, `.git/`, `.speclaw/`, `dist/`, or outside the project never
  nudge.
- **`PostToolUse` only, context only.** The nudge is delivered as
  `hookSpecificOutput.additionalContext` (in the `speclaw_check` MCP result and
  in `speclaw check --hook-payload -` output) — on `PostToolUse` only; `Stop`
  and `InstructionsLoaded` output is unchanged. It never carries a
  `permissionDecision`, never changes the verdict, and never blocks. There is
  no `PreToolUse` entry for it: a `PreToolUse` "allow" would auto-approve reads.
- Reads never evaluate laws: for `PostToolUse` `Read`/`Grep`/`Glob` the check
  returns `evaluated: []` and only the nudge. Laws keep governing mutations.
- No index access: the check uses only the call-log tail and the in-memory
  extension table, and fails open (no nudge) on any error.

**Upgrading.** Because the hook entry set changed, `speclaw update` on an
existing install reports the agent settings file (e.g. `.claude/settings.json`)
under `refreshedDiverged`. That is expected: speclaw merged its new entry by
identity and kept every non-speclaw hook. Use `update --backup` to keep a
`.bak` copy.

### Session-start refresh (hooks)

For hook-capable agents (Claude Code), `init` / `update` also install one
`SessionStart` entry, laws or not:

```json
"SessionStart": [{ "matcher": "startup|resume|clear|compact",
  "hooks": [{ "type": "command", "command": "cd \"${CLAUDE_PROJECT_DIR:-.}\" … speclaw session-start …", "timeout": 30 }] }]
```

The POSIX `sh` command refreshes the index before the agent asks anything, so
Compass answers from a graph that matches the working tree after a `git pull`,
a branch switch, or edits made outside the agent.

- **Skips when absent.** The command does nothing when `.speclaw/index.db` does
  not exist (the check runs in the shell, before Node starts). It never builds
  a first index; that stays `compass_index` / `speclaw index`.
- **Local first, never the network.** It runs `node_modules/.bin/speclaw`, else
  `speclaw` on `PATH`, else
  `npm_config_offline=true npx --no-install @esneiderbravo/speclaw` with
  `npm_config_update_notifier=false`: npx neither installs nor revalidates
  against the registry, npm's own update notifier stays off, so it makes no
  registry request and only runs a copy already in the npx cache.
- **Silent and fail-safe.** Output is discarded (`SessionStart` stdout would
  enter the agent's context) and `|| true` keeps the exit code 0. The hook is
  blocking with a 30 s timeout. A run that exceeds it is killed and its
  transaction rolls back, so it repeats (and times out) at every session start;
  after a large pull or a forced reindex, run `speclaw index` / `compass_index`
  once yourself.
- **`speclaw session-start`.** The command the hook runs: it exits 0
  without creating an index when none exists, otherwise runs an incremental
  index (no force, no prune; flags are ignored), prints nothing, swallows
  every error (including `SQLITE_BUSY` from a concurrent writer, after the
  5 s busy timeout), and is not written to the call log. On an unchanged
  project it takes the no-op fast path, so it leaves `docs/compass.md` alone.
- **Merge identity.** A `command` hook whose command contains
  `speclaw session-start` is speclaw's: re-running `init` / `update`
  replaces it instead of adding a second one. Any other `SessionStart` hook is
  left untouched.

**Upgrading.** The new entry makes `speclaw update` report the settings file
under `refreshedDiverged` once, as for the nudge above. `session-start` is a
top-level command, so an older speclaw (before 2.0.7) that resolves first —
for example a stale global install on `PATH` — rejects it as unknown and exits
before indexing, logging, or touching any file; the refresh simply does not
happen until that binary is upgraded.

### Reindex on edit (hooks)

For hook-capable agents (Claude Code), `init` / `update` also install a
separate `PostToolUse` entry, laws or not:

```json
"PostToolUse": [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit",
  "hooks": [{ "type": "command", "command": "cd \"${CLAUDE_PROJECT_DIR:-.}\" … speclaw reindex-file …", "timeout": 10 }] }]
```

It is the session-start command with `reindex-file` as the subcommand (same
index guard, local → `PATH` → offline `npx --no-install` resolution, discarded
output, exit 0). The hook payload on stdin reaches speclaw unchanged.

- **What it does.** `speclaw reindex-file` (no argument) reads the payload,
  takes `tool_input.file_path` (or `notebook_path`), and starts a detached
  `speclaw reindex-file -- <file>` child, then exits at once, so the edit is
  not slowed down. The child re-indexes just that file: its nodes, edges,
  full-text rows, metrics, and embeddings (cache misses only), resolves the
  edges into and out of it, and updates the directory hashes of its ancestors.
  A deleted file is removed. A file the full walk would skip (outside the
  project, under `node_modules`/`dist`/…, of no indexed language, or over the
  size cap) is ignored. With paths (`speclaw reindex-file src/a.ts`) it does
  the same in the foreground.
- **Deferred global work.** A per-file run does not recompute PageRank, touch
  or evict the embedding cache, rewrite `docs/compass.md`, or change
  `indexed_at`. Until the next full run, the edited file's symbols rank without
  a PageRank score. It sets `meta.post_pending`, so the next full run (session
  start, `speclaw index`, `compass_index`, watch) skips its no-op fast path and
  does that work, then clears the marker. A scoped run also never re-ranks an
  edge already bound elsewhere: when an edit adds a better candidate for an
  ambiguous name, the old binding stays until a full run re-extracts the
  calling file.
- **Silent and fail-safe.** It prints nothing, is not written to the call log,
  and swallows every error, including `SQLITE_BUSY` (the child waits up to the
  5 s busy timeout, then gives up; the next run catches up). Runs are
  idempotent, so there is no debounce. The file is read after the write lock is
  taken, so the last of two overlapping runs stores the last edit.
- **Not covered.** Files created, renamed, or deleted by shell commands
  (`git mv`, `sed -i`, a branch switch), edits made outside the agent, and
  agents without hooks. The session-start refresh, `compass_index`, and
  `speclaw watch` cover those.
- **Merge identity.** A `command` hook whose command contains
  `speclaw reindex-file` is speclaw's: re-running `init` / `update` replaces it
  instead of adding a second one. It is never folded into the `mcp_tool`
  feedback group, and any other `PostToolUse` hook is left untouched.

**Upgrading.** The new entry makes `speclaw update` report the settings file
under `refreshedDiverged` once. A speclaw older than 2.0.11 that resolves first
rejects `reindex-file` as unknown and exits before touching the index.

### The Cortex evidence gate

See [`cortex.md`](cortex.md#compass-first-evidence-gate-compassgate).

<!-- speclaw:map:start -->
speclaw · 259 files · 1205 nodes
src/ (128)  test/ (123)  scripts/ (7)  eslint.config.js/ (1)
hubs: write 555 · tmpRepo 522 · buildIndex 158 · read 137 · openDb 123 · runCli 91 · has 69 · specInit 59 · commit 55 · estimateTokens 44 · explore 42 · handleHarness 42
entry: src/server.ts (mcp) · src/cli/index.ts (bin)
<!-- speclaw:map:end -->

## Project-specific starting points

**Entrypoints**

- `buildServer` (`src/server.ts`) — the MCP server: registers every module's
  tools. `compass_explore buildServer` shows what each module contributes.
- `dispatch` (`src/cli/index.ts`) — the CLI router: maps a command to its
  handler via lazy `import()`. Start here to find any command's code.

**Module surfaces** — each module's public boundary is its `register.ts`; the
logic sits beside it:

- foundation: `scaffold` (`src/modules/foundation/scaffold.ts`),
  `doctor` (`doctor.ts`)
- compass: `parser.ts` → `extract.ts` → `indexer.ts` → `db.ts` (`node:sqlite`),
  with `embedder.ts` (recall), `query.ts` (explore/search/impact/trace),
  `visualize.ts`, `watcher.ts`
- lawbook: `engine.ts` (init/validate/sync/archive/list)
- tools: `packs.ts` (`loadPacks`), `register.ts`

**Common traces**

- CLI → core: `runInit` (`src/cli/commands/init.ts`) → `scaffold` →
  `shared/install` + `shared/render` + `shared/agents`. Try
  `compass_explore runInit` with `to: scaffold`.
- Index build: `runIndex` (`src/cli/commands/index-build.ts`) →
  `compass/indexer.ts` → `parser.ts`/`extract.ts` → `db.ts`.
- MCP tool → work: canonical tools register in each module's `register.ts`,
  validate with Zod, and delegate to the logic file next to it.

**Shared core** (`src/shared/`): `install.ts`, `paths.ts`, `render.ts`,
`agents.ts`, `manifest.ts`, `version.ts`, `mcp.ts` — the innermost layer; use
`compass_explore` with `include: ["blast_radius"]` on any of these before changing
it (wide blast radius).
