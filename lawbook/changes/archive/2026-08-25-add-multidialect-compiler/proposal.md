# add-multidialect-compiler — compile laws into agent rule dialects

## Why

Laws already live in `.speclaw/laws-manifest.json` and compile to **hooks**, but
agent **text rules** still come from static personalized templates
(`AGENTS.md`, `CLAUDE.md`, ad-hoc `ai-specs/rules`). Supporting another agent
means hand-maintaining another format. The market pattern is universal
`{glob → prose}`; speclaw should compile once and verify forever — not compete
with rulesync on sync alone.

Roadmap **multidialect-compiler** (#15). Explore (2026-08-25) locked:

| # | Decision |
| --- | --- |
| 1A | `AGENTS.md` / `CLAUDE.md` stay personalized; speclaw writes **delimited blocks** only |
| 2A | Cursor rules stay under `ai-specs/rules` via existing symlink |
| 3B | Full dialect set + import + budget + nested AGENTS |
| 4B | Parse `docs/standards/*` into the Law IR (merge with manifest/seed) |

## What

1. **Parse** normative law sections from `docs/standards/*.md` (+ keep seed/manifest).
2. **Compile** to five dialects: AGENTS (degraded scope→prose, nested when needed),
   Claude `.claude/rules` via `ai-specs/rules` + symlink, Cursor `.mdc` in
   `ai-specs/rules`, Copilot `.github/instructions`, CodeRabbit merge into
   `.coderabbit.yaml`.
3. **CLI** `speclaw laws compile` / `speclaw laws import --from rulesync` (and
   optional `speclaw_setup` action). **No new MCP tools** (tool-surface).
4. **Doctor** reports always-on token estimate; warn >2000.
5. **Draft imported laws** (`status: draft`) do not gate `verify`.

## Non-goals

- Competing with rulesync/ruler as a sync product (interop via import only).
- New MCP tools beyond the eight canonical surface.
- Gemini/Windsurf/Cline dialects in this change (Codex covered by AGENTS.md).
- Making `AGENTS.md`/`CLAUDE.md` fully managed overwrite.
- Emitting `rationale` into path-scoped rule bodies (token cost).

## Migrations

Optional `Law.status` (`active` \| `draft`) on the manifest schema — additive;
default `active` for existing laws. No Compass schema bump.

## Capabilities

- `law-enforcement` — Law IR, compile, import, doctor budget, draft status
- `cli` — `laws compile` / `laws import` surface and help
