# check-dispatcher — laws as a real enforcement layer via agent hooks

## Why

speclaw's promise is "specs become law". Today they are prose in `LAWS.md` and
`docs/standards/*.md` that the agent reads at session start and then forgets:
compliance is measured to degrade past ~15 tool calls, when the tool history
dominates the context window. Anthropic's own docs say the quiet part out loud —
*"An instruction like 'never edit .env' in CLAUDE.md or a skill is a request, not
a guarantee. A `PreToolUse` hook that blocks the edit is enforcement."* The gap
between the product's name and what it technically delivers is exactly this: a
law that must hold **every time** is, right now, a suggestion.

This change closes that gap by compiling a project's declared laws into
Claude Code hooks, so a blocking law is enforced at the moment of the action
(`PreToolUse`) rather than trusting the model to recall it. It is roadmap piece
2/19 — "the one that most changes the pitch" — and it builds the manifest seam
(`.speclaw/laws-manifest.json`) that `executable-laws` and `verify-ci` later
extend.

Authority note: the scope below follows
[`docs/roadmap/02-correcciones-verificadas.md`](../../../docs/roadmap/02-correcciones-verificadas.md)
§4, which corrects the original feature doc
[`docs/roadmap/runtime/check-dispatcher.md`](../../../docs/roadmap/runtime/check-dispatcher.md)
on four verified points (dependency on a machine-readable law model; hooks live
in `settings.json` not a standalone file; `defer_loading` is not author-settable;
`AgentDef` needs a hooks capability). The corrections doc has authority where the
two diverge.

## What

- A canonical **`Law` model** and a **`.speclaw/laws-manifest.json`** written by
  `init`/`update`. The model carries the full intended shape (aligned with the
  discriminated-union `Verification` of `executable-laws` §3.2), but this change
  **implements a single backend: `path`** (pure glob matching). Any law with
  another `verification` kind is recorded, reported by `doctor` as "declared, no
  backend yet", and ignored at runtime.
- A new MCP tool **`speclaw_check(projectPath, event, toolName?, payload)`**
  returning ACS-aligned verdicts (`allow` / `warn` / `deny` / `escalate`) plus
  `elapsedMs`. On `deny` it cites the law id, its literal prose, and its source
  path.
- A **hook compiler** that emits `mcp_tool` hook entries and merges them
  **idempotently by identity** (`{type:"mcp_tool", server:"speclaw"}`) into each
  hook-capable agent's `settings.json`, never touching foreign entries. A
  `command`-hook fallback (`speclaw check --hook-payload -`) covers CLI-only use.
- **`AgentDef.hooks?: { file, key }`** so the compiler skips agents without hook
  support by construction (Cursor, Codex, Windsurf), and `doctor` reports the
  asymmetry by name.
- Events wired: `PreToolUse` (block), `PostToolUse` (feedback into context),
  `Stop` (end-of-turn), `InstructionsLoaded` (context-coverage audit).
- **`doctor`** gains a context-coverage section (which laws entered context,
  incl. the post-`compact` behavior of `paths:` rules) and **glob validation**
  that fails loudly at generation time, not at runtime.
- **Seed** the manifest from speclaw's own Project-specific laws in `LAWS.md`
  (the ones that are `path`-verifiable today), shipped as template assets — so
  the demo is "speclaw enforces its own constitution", not "speclaw blocks
  `.env` like any linter".
- Non-negotiable guarantees: **fail-open** (a crashed evaluator never blocks the
  agent) and a **latency budget** (`PreToolUse` p99 < 15 ms with 50 laws) that
  ships as a test in the suite, not as a backlog note.

## Non-goals

- **The law-authoring surface** (how a human writes a law — the fenced
  ` ```law json ` block inside `docs/standards/*.md` stripped by `render.ts`),
  the `ast`/`deps`/`process`/`semantic` backends, `@ast-grep/napi`, graph rules,
  Tarjan cycle detection, and the known-violations baseline. All of that is
  **`executable-laws`**, which extends this same manifest — it does not rewrite
  it. This change ships seed laws as an asset, not a markdown parser.
- **Consolidating the existing tool surface** — that is `tool-surface`. Note:
  the repo now registers **19** MCP tools, so `speclaw_check` is the **20th**
  (the corrections doc's "#18" predates the `tools` module); record it in the
  token-budget accounting.
- Modifying the canonical `project-update` / `cli` specs: enforcement artifacts
  use a bespoke merge-install path (a keyed merge into a multi-purpose JSON),
  distinct from the `ai-specs/` whole-file managed-file flow, so this behavior is
  owned by the new `law-enforcement` capability rather than diluting those.

## Migrations

None. The feature is additive and opt-in per agent: only agents the user
selected that support hooks receive hook entries, and only laws explicitly marked
`enforcement: "bloqueo"` block. A new law defaults to `feedback`. No schema
version bump and no data migration.
