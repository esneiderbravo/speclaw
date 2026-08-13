# Design — check-dispatcher

## Approach

Add a new `foundation` submodule that compiles the project's laws into agent
hooks and evaluates actions against them at runtime. Five moving parts:

1. **`Law` model + manifest** (`src/modules/foundation/laws.ts`). The model
   carries the full intended shape; the manifest `.speclaw/laws-manifest.json`
   is written by `init`/`update`. Only the `path` backend is implemented.
2. **Evaluator** (`src/modules/foundation/check.ts`, `checkAction()`). Loads the
   manifest once, compiles the glob index, caches it in the live MCP-server
   process, invalidates by manifest `mtime`. Returns ACS verdicts + `elapsedMs`.
3. **Tool** (`src/modules/foundation/register.ts`, `speclaw_check`). Thin
   delegate to `checkAction()`, per LAWS.md law 2 (two transports, one impl).
4. **Hook compiler + merge-install** (`src/modules/foundation/hooks.ts`).
   Compiles laws → `mcp_tool` hook entries and merges them into each
   hook-capable agent's `settings.json` by identity. Records a baseline in
   `.speclaw.json`.
5. **CLI + doctor** (`src/cli/commands/check.ts`; extend `doctor.ts`).
   `speclaw check` gives the `--hook-payload -` fallback and `--dry-run`; doctor
   gains context-coverage + glob validation + agent-asymmetry reporting.

`AgentDef` gains `hooks?: { file, key }` so the compiler skips Cursor/Codex/
Windsurf by construction, not by an `id === "claude"` branch.

## Key decisions and the docs they reconcile

The two roadmap docs diverge on several points;
`02-correcciones-verificadas.md` has authority. Decisions:

- **Verification model shape — discriminated union, with a new `path` variant.**
  The corrections doc (enmienda 1) sketches a flat `verification: "path" | ...`
  string; `executable-laws` §3.2 models it as a discriminated union
  `{ kind: "ast" | "graph" | "process" | "traceability" | "semantic" | "none" }`.
  These conflict. We adopt the **union** (it is what `executable-laws` will
  extend) and add a `{ kind: "path" }` variant for pure-glob matching, which this
  change implements. This is the composition the corrections doc §2.1 demands —
  `executable-laws` fills in more `case`s, it does not rewrite the model.
  Alternative (flat string) rejected: it would force `executable-laws` to migrate
  the field, breaking "extends, not rewrites".

- **Hooks live in `settings.json`, merged by identity.** Rejected: a standalone
  `.claude/hooks.json` (only exists inside a plugin) and plugin distribution —
  corrections §2.2 kills the plugin route with three independent findings
  (marketplace plugins are cached to `~/.claude/plugins/cache`, breaking the
  `update` cycle; `enabledPlugins` still touches the shared file; out-of-plugin
  symlinks are dropped). The merge the earlier exploration called "unsolvable" is
  ~20 lines: the triple `{type:"mcp_tool", server:"speclaw", tool:"speclaw_check"}`
  *is* the identity — remove speclaw-owned entries, re-add compiled ones, never
  touch foreign entries. Idempotent, marker-free, cannot delete others' work.

- **`mcp_tool` hooks, not `command`.** One implementation in the already-running
  MCP server (no per-tool-call Node process spawn), portable across
  Windows/pnpm/global installs, and — the bonus corrections §2.2 highlights — the
  identity for the merge comes free; with `command` hooks we'd have to parse
  command strings to recognize our own. `command` remains the CLI-only fallback
  (`speclaw check --hook-payload -`, exit code 2 to block).

- **No `defer_loading`.** Corrections §2.3: tool-search deferral is a client-side
  decision (`ENABLE_TOOL_SEARCH=auto:N`), not author-settable from an MCP server.
  So `speclaw_check` cannot be hidden; the only lever is a ≤12-word description
  that says "invoked by speclaw's hooks — do not call directly". Recorded for
  token-budget: the tool count is now **19**, so this is tool **#20**.

- **Seed from speclaw's own laws, as an asset — not a markdown parser.** The
  authoring surface (parsing ` ```law json ` blocks out of `docs/standards/*.md`)
  belongs to `executable-laws` per corrections §2.1. This change ships seed laws
  as a template manifest asset, derived from the `path`-verifiable
  Project-specific laws in `LAWS.md`:

  | LAWS.md law | scope | verification | enforcement |
  | :-- | :-- | :-- | :-- |
  | 3 · protect the templates | `src/modules/*/assets/**` | `path` | `feedback` → `bloqueo` once tuned |
  | 1 · local-first | `package.json` | `path` (later `process`) | `feedback` |
  | 5 · honest attribution | `ATTRIBUTION.md`, `src/modules/{compass,lawbook}/**` | `path` | `feedback` |

  Laws 2 (`deps`) and 4 (`process`) are declared but inert until
  `executable-laws`. Law 3 starts at `feedback` — hard-blocking asset edits in
  this very repo would obstruct daily work; a new law defaults to `feedback`
  anyway.

- **Fail-open, always.** An enforcement layer that blocks the agent when its own
  evaluator crashes is worse than none. Missing/corrupt manifest or any
  exception → `allow` + a diagnostic. Verified by test.

- **Latency is a requirement, not an aspiration.** `PreToolUse` sits on the
  critical path of every tool call. p99 < 15 ms with 50 laws ships as a suite
  benchmark; over budget is a red test. Achieved by a precompiled in-memory glob
  index scoped to the payload path — zero disk I/O, zero AST parsing on
  `PreToolUse`.

- **Capability boundary.** New capability `law-enforcement`, not deltas to
  `project-update`/`cli`. The settings.json merge is a keyed merge into a
  multi-purpose JSON — a bespoke install path distinct from the `ai-specs/`
  whole-file managed-file flow `project-update` governs — so folding it there
  would dilute that spec. The `speclaw check` command is enforcement's own CLI
  surface, not a change to the branded-header behavior `cli` governs.

## Verdict mapping (ACS → Claude Code)

ACS defines `allow/warn/deny/escalate`. Claude Code's `PreToolUse` has no `warn`;
the equivalent is `allow` with the message in the output, which still enters
context and the agent reads it. Blocking uses
`hookSpecificOutput.permissionDecision: "deny"` with
`permissionDecisionReason` (the legacy `{"decision":"block"}` is avoided). The
knowledge of this wire format is isolated in `hooks.ts` — nothing else in the
codebase knows what a hook entry looks like, mirroring the MCP isolation pattern.

## Alternatives weighed

- **Reorder the roadmap so `executable-laws` lands first** — rejected
  (corrections §2.1): the manifest is a contract seam, split so this change owns
  the schema + `path` backend and `executable-laws` extends it. Composition, not
  ordering.
- **Whole-file managed template for `settings.json`** (`copyRendered`) — rejected
  (corrections §2.2): it overwrites, destroying the user's own hooks. A dedicated
  merge-installer is required, still recording a `.speclaw.json` baseline so
  `update`/`--backup` work.
- **Generic seed rules (`.env`, `dist/`)** — rejected (corrections enmienda 2):
  seeding from speclaw's own constitution validates the schema against real laws
  and makes a far stronger demo.

## Risks

- **Over-aggressive enforcement → user disables speclaw** (silent, fatal UX
  failure). Mitigation: only `enforcement: "bloqueo"` blocks; new laws default to
  `feedback`; `speclaw check --dry-run` previews.
- **Claude Code's hook surface changes** (young API, 30+ events). Mitigation:
  all format knowledge isolated in `hooks.ts`.
- **Asymmetry across agents** (Cursor/Codex have no hooks). Mitigation: `doctor`
  states it by name; `verify --ci` is the leveler in CI (that's `verify-ci`).
