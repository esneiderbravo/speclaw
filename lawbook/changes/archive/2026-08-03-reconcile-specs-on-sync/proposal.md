# Proposal — reconcile-specs-on-sync

## Why

`lawbook_sync` and `lawbook_archive` are deterministic file copies: `specSync`
(`src/modules/lawbook/engine.ts:193`) walks `changes/<name>/specs/**.md` and
copies each file over the canonical `lawbook/specs/`, and `specArchive`
(`engine.ts:236`) calls `specSync` then renames the folder. Neither reads the
code. `specArchive` folds `specSync` in, so `archive` never prompts for a
separate sync — by design.

The gap: when the agent builds behavior *after* the initial draft without
updating the delta specs (a real case: a DB path rename to `data/cashbook.db`
plus auto-migration added during the polish phase), `sync`/`archive` promote
**stale specs** and never warn. There is no code-vs-spec drift detection, so
the canonical specs silently fall behind the implementation.

The fix cannot live in `engine.ts`: reviewing what was built, comparing it to
the contracts, and deciding what is missing is reasoning work — it belongs in
the agent/skill layer that is already running. `specSync` stays a dumb copy;
the skills gain the intelligence.

## What

1. **`sync` skill — reconciliation phase.** Before running `lawbook_sync`, the
   agent reconstructs what was actually built (branch `git diff` since the
   change was drafted + `compass_explore`/`compass_impact` on the touched
   symbols), compares it to the change's delta specs, detects
   built-but-unspecified behavior, and writes it into the delta specs so the
   promotion reflects reality.

2. **`archive` skill — recommend-sync gate.** Before archiving, the agent runs
   the same reconciliation review. If drift is found it **recommends** a sync
   (marked recommended, not forced) and shows short insights — what was built
   outside the original contract and why it matters — proceeding to archive
   only after the specs are reconciled or the user explicitly accepts the
   drift.

3. **`build` skill — reinforce.** Step 5 states that reconciliation is
   formalized at `sync`, so drift accumulated after the initial spec is caught,
   not left to chance.

4. **Docs.** `docs/standards/lawbook.md` (and its foundation template) describe
   the reconciliation step in "The loop" and "Archiving discipline".

## Non-goals

- No change to `specSync`/`specArchive` behavior in `engine.ts`. They remain
  deterministic copies; `lawbook_validate` stays the structural gate.
- No automated code-understanding in the engine or a new MCP tool. The
  reconciliation is performed by the agent following the skill.
- No hard block on archive: the recommendation is advisory ("recomendado"), the
  user may accept known drift and proceed.

## Migrations

None.
