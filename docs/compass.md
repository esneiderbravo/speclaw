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
| `compass_index` | Build/refresh the graph (`.speclaw/index.db`); optional watch actions (`start`/`stop`/`status`). Schema **10** adds FTS5 `nodes_fts` + `node_text` + `pagerank` (9→10 migrates; reindex populates text, embedding cache reused). Also: `embedding_cache`, Merkle, `node_metrics`, test/module flags. |
| `compass_explore` | Read a node's source plus callers, callees, blast radius, affected tests, and hotspot — in one call. `node` may be a symbol name or a repo-relative file path. Use `to:` for trace-style paths. |
| `compass_find` | **Hybrid** search always: BM25 + vectors + name match → RRF → task-relative rank. `mode: exact|concept` only adjusts fusion weights. Optional `focus` / `maxTokens`. |
| `compass_diff_context` | Graph context for a change set (working tree, git rev, or explicit paths): symbols touched, blast radius, tests, hotspots. |
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
a missing graph is not license to skip Compass. The only legitimate fallbacks
to Grep/Read: a Compass call returned nothing useful for your query, or the
target isn't indexed code (stylesheets, JSON/config, markdown, logs).

## Index totals and next step

`compass_index` / `speclaw index` report the delta of the run (`files`,
`nodes`, `edges`, `computed`, `fromCache`, `unchanged`, …) **and** the whole
repository's `totals: { files, nodes, edges }`, so a no-op rerun still shows
how much is indexed. `nextStep` is a one-line hint, e.g. `Index ready: 412
files, 3,180 symbols. Next: compass_find "<concept>" or compass_explore
<symbol> — do not grep.` Both fields are in `--json` output; the human output
prints a `Totals:` line and the hint.

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

### The Cortex evidence gate

See [`cortex.md`](cortex.md#compass-first-evidence-gate-compassgate).

<!-- speclaw:map:start -->
speclaw · 230 files · 948 nodes
src/ (121)  test/ (103)  scripts/ (5)  eslint.config.js/ (1)
hubs: tmpRepo 361 · write 300 · has 147 · parse 112 · log 79 · openDb 78 · run 66 · commit 52 · runCli 50 · recordCompassCall 36 · text 34 · gitInit 33
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
