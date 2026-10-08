# Design — lean-tools

## Tool surface

- `shared/tool-catalog.ts` keeps `CANONICAL_TOOLS` (9) and renames the alias map to
  `RETIRED_TOOLS` (name → canonical call). It is no longer used to register anything; only
  `shared/deprecation.ts#scanRetiredToolReferences` reads it, for `doctor`.
- Removed: `defineAliasTool` (`shared/mcp.ts`), `aliasesEnabled` / `SPECLAW_NO_ALIASES`,
  `logDeprecatedCall` / `readDeprecatedCallCounts` / `prefixDeprecated`, and each module's alias
  block in `compass/register.ts`, `lawbook/register.ts`, `foundation/register-core.ts`.
- `lawbook_change` drops action `harness` and its `harnessOp`/`verdict`/`openQuestions`/
  `pauseForQuestions` fields; `speclaw lawbook harness` is gone. `cortex` / `speclaw cortex`
  call the same `handleHarness`, which is unchanged.
- Compass call evidence (`EVIDENCE_TOOLS`) counts only canonical names; the CLI query verbs
  `search`/`recall`/`impact`/`trace` log as `compass_find` / `compass_explore`.
- Every generated text (scaffold next steps, `speclaw init` prompt, update migration prompts,
  bug template, investigate fallback, output-budget hint) names canonical calls. A test scans
  every shipped asset for retired names.

Decision: keep `RETIRED_TOOLS` rather than delete it — it costs nothing at runtime and lets
`doctor` and the update prompt guide projects whose own docs still cite old names.

## Scoped review

- `cortex/review.ts` exports the branch diff to `.speclaw/review/<change>.diff` (merge-base with
  `main`/`master`, plus uncommitted and untracked files, excluding `.speclaw/`) and builds the
  review prompt: read the diff once, one `compass_diff_context`, hunks only, ~10 tool calls,
  ≤ 40-line `review.md`, defect checklist. No git base → `compass_diff_context` alone.
- `cortex` action `brief` adds `review` only at stage `reviewing`; the coordinator pastes
  `review.prompt` unchanged to the reviewer. The reviewer agent asset carries the same
  checklist (a test keeps them in sync) and no `model:` line, so it works in any agent.

## Failing-test hint and benchmarks

See `tasks.md` §1.3–1.4: the hint lives on the existing `PostToolUse` path and parses the tool
result in memory (no git, no index); the benchmark scripts run in `mktemp` repos with the
agent command configurable.

## Data flow

agent → MCP `cortex brief` → `review.ts` (git diff → file) → prompt → reviewer agent →
`reports/review.md` → `cortex advance` with verdict.
