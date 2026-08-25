# Design — add-multidialect-compiler

## Decisions (confirmed in explore)

| # | Choice | Implication |
| --- | --- | --- |
| Ownership | **1A** delimited blocks | Markers e.g. `<!-- speclaw:laws:start -->` … `end`; never wipe user prose |
| Cursor | **2A** `ai-specs/rules` + symlink | Aligns with `MANAGED_TREES` + `AgentDef.linkTargets` |
| Scope | **3B** full | Five dialects + import + budget + nested AGENTS |
| Source | **4B** parse standards | Standards → Law[]; merge by `id` with manifest (manifest wins on conflict unless `--from-standards`) |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Reuse `Law` / Zod / `globError` | `foundation/laws.ts` | Do not invent a second IR; add optional `status?: "active" \| "draft"` |
| Parse standards | `foundation/laws-parse.ts` (new) | Extract `### Requirement:` / law tables into `Law[]` with stable `law~…~N` ids |
| Dialect emitters | `foundation/dialects/*.ts` (new) | One file per dialect; golden-testable |
| Orchestrator | `foundation/compile-laws.ts` (new) | Load → merge → validate → emit → report |
| Import | `foundation/import-rules.ts` (new) | rulesync (and minimal AGENTS/.mdc) → draft laws |
| Wire | `scaffold` / `update` / CLI `laws` | Compile after manifest ensure; CLI for explicit runs |
| Agent caps | `shared/agents.ts` | Optional `dialects?: DialectId[]` or separate `DIALECTS` table — avoid `id === "claude"` branches |

**Merge order (laws):**

```
seed ∪ parse(standards) ∪ manifest
  → by id: manifest entry wins; new ids from standards append
  → draft imports never overwrite active same-id
```

**Emit order (artifacts):**

```
validate scopes (reuse globError)
→ claude-rules + cursor-mdc into ai-specs/rules/
→ ensure .claude/rules/speclaw symlink when claude configured
→ copilot instructions (scoped only; never also dump same law into AGENTS for Copilot dual-read)
→ coderabbit path_instructions merge (best-effort; missing file OK)
→ patch AGENTS.md / CLAUDE.md delimited blocks (+ nested AGENTS when threshold)
→ rewrite LAWS.md index block (delimited) listing ids — LAWS remains personalized wrapper
```

**CodeRabbit:** emit only if agent/dialect selected or `.coderabbit.yaml` already exists; never fail init if merge skipped.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| New MCP `laws_compile` / `laws_import` | Violates tool-surface (8 canonical tools) |
| Full managed overwrite of AGENTS/CLAUDE | Breaks personalized update model (1A) |
| Committed `.cursor/rules/*.mdc` only | Conflicts with existing symlink architecture (2A) |
| Parse-only without emitters / emitters without parse | User chose 4B + 3B together |

## Risks

| Risk | Mitigation |
| --- | --- |
| Standards markdown is free-form → brittle parse | Start with explicit markers / `law~id` in HTML comments; fail loud on duplicates |
| Looks like rulesync | README + import path; verify stays the differentiator |
| Copilot dual-read nondeterminism | Emit scoped laws only to `.github/instructions`; AGENTS block is degraded summary without duplicating the same scoped body |
| CodeRabbit schema drift | Best-effort dialect; init does not hard-fail |

## File plan

```
src/modules/foundation/laws.ts              + status field
src/modules/foundation/laws-parse.ts        NEW
src/modules/foundation/compile-laws.ts      NEW
src/modules/foundation/import-rules.ts      NEW
src/modules/foundation/dialects/            NEW (agentsmd, claude, cursor, copilot, coderabbit)
src/modules/foundation/scaffold.ts          call compile on init/update
src/cli/commands/laws.ts                    compile + import subcommands
src/modules/foundation/doctor.ts            alwaysOnTokens
test/unit/laws-parse.test.ts               NEW
test/unit/dialects.test.ts                 NEW
test/unit/degrade.test.ts                  NEW
test/unit/import-rules.test.ts             NEW
test/integration/compile-laws.test.ts      NEW + goldens
```
