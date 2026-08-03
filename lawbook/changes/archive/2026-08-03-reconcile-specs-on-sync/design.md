# Design — reconcile-specs-on-sync

## Approach

Keep the deterministic layer (`specSync`, `specArchive`, `lawbook_validate`)
untouched and add the reconciliation as an **agent-executed phase in the skill
layer**. The skills already run inside the agent that has Compass, git, and the
full code context — the one actor that can compare implementation to contract.

- **sync skill** gains a phase before `lawbook_sync`:
  1. Establish the baseline: the change's delta specs under `specs/`.
  2. Establish reality: `git diff <base>...HEAD` for the change branch (base =
     where the change was drafted / branch point) plus `compass_explore` /
     `compass_impact` on the changed symbols to understand behavior, not just
     lines.
  3. Diff intent vs reality: list behavior that is implemented but absent from,
     or contradicted by, the delta specs.
  4. Reconcile: write the missing/contradicted behavior into the delta specs
     (normative requirements + scenarios), so the subsequent copy promotes an
     accurate contract.
  5. Promote with `lawbook_sync`.

- **archive skill** runs the same review (steps 1–3) as a gate. If drift is
  found it surfaces a **recommendation** with short insights and does not
  archive until the specs are reconciled or the user accepts the drift; then it
  calls `lawbook_archive` (which re-runs `specSync` internally).

## Alternatives weighed

1. **Detect drift deterministically in `engine.ts`** (e.g. compare spec
   mentions to changed files). Rejected: it can flag that files changed but
   cannot judge whether the *behavior* is specified — the exact reasoning that
   caused the miss. False confidence, engine complexity, still needs the agent.

2. **A new `lawbook_reconcile` MCP tool.** Rejected for now: the work is
   reading + judgement + prose edits to specs, which is what the agent does
   natively. A tool would either be a thin wrapper around agent reasoning or a
   heuristic that misses semantic drift. Revisit only if a deterministic signal
   (e.g. "source changed since draft") proves worth surfacing.

3. **Hard-block archive until zero drift.** Rejected: the user asked for
   *recommended*, not forced. Known/accepted drift (deliberate scope cuts) must
   still be archivable with an explicit acknowledgement.

## Trade-offs

- The guarantee is only as strong as the agent's review — this is guidance, not
  a mechanical gate. Accepted: the deterministic gate (`lawbook_validate`)
  stays, and the alternative (silent stale specs) is strictly worse.
- Reconciliation adds a step to every sync/archive. Accepted: it is the point —
  the specs must track what shipped, and the review is cheap relative to a
  drifted source of truth.

## Affected files

- `ai-specs/skills/sync/SKILL.md` + template
  `src/modules/lawbook/assets/skills/sync/SKILL.md`
- `ai-specs/skills/archive/SKILL.md` + template
  `src/modules/lawbook/assets/skills/archive/SKILL.md`
- `ai-specs/skills/build/SKILL.md` + template
  `src/modules/lawbook/assets/skills/build/SKILL.md`
- `docs/standards/lawbook.md` + template
  `src/modules/foundation/assets/docs/standards/lawbook.template.md`
- Commands `ai-specs/commands/lawbook/{sync,archive}.md` + templates
  `src/modules/lawbook/assets/commands/{sync,archive}.md` (point to the new
  reconciliation step).
