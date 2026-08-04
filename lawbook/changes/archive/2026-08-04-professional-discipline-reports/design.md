# Design — professional discipline reports

## Approach

Encode the report structure where the agent already looks: the `build` skill
(the instruction it follows while implementing) and the testing standard (the
law it is bound by). Both, not one — the skill is the operational how-to, the
standard is the normative why-it-must. The skill carries the full skeleton; the
standard carries the shortened normative version and the honesty rules.

The required skeleton (per discipline file, e.g. `backend.md`):

1. **Title + header** — `# <Discipline> checks — <change> (<date>)` and a line
   `Date · Branch · Environment/cwd`.
2. **Gates & results table** — `| Check | Command | Result |` with exact counts
   and ✅/⚠️/❌, quoting real output.
3. **Tests added / updated** — each new or changed test and what it asserts;
   TDD note ("failed before, passes after") where applicable.
4. **Spec-scenario coverage** — a table mapping each `#### Scenario` in the
   change's delta specs to how it was verified (test id, gate, or manual step).
5. **Pre-existing / unrelated failures** — any failing check not caused by this
   change, with proof (e.g. `git stash` reproduces it) — or "none".
6. **Pending manual steps** — anything not automated, stated plainly — or "none".
7. **Verdict** — one line.

Disciplines the change did not touch are omitted, as today. When a test kind
does not apply (no unit runner yet), the report says so and records the gates +
manual verification that stood in — the existing escape hatch, preserved.

## Alternatives weighed

- **Ship a physical `reports/_template.md` that `draft` copies.** More robust
  against an agent skimming the skill, but adds a file to maintain and a copy
  that drifts from the skill. The explore decision chose the skill-only route;
  the skeleton is short enough to live inline.
- **Add a validator that checks a report contains the required sections.**
  Rejected as scope creep — the archive gate already requires a report to exist;
  parsing headings is brittle and out of proportion to the problem.
- **Only add honesty rules, leave the shape free.** Rejected: the inconsistency
  is structural, not just about honesty. A fixed skeleton is what makes the
  output reproducible.

## Trade-offs

- The skeleton is enforced by convention (skill + standard), not mechanically.
  Accepted: consistent with how every other workflow step is enforced here.
- Restating the full `lawbook-workflow` capability in the delta spec (because
  `lawbook_sync` copies delta specs over canonical wholesale) duplicates the
  unchanged requirements. Accepted: it is the repo's established delta shape and
  `sync`/`archive` depend on it.

## Files touched

- `src/modules/lawbook/assets/skills/build/SKILL.md` + `ai-specs/skills/build/SKILL.md`
  — Step 5 rewrite (shipped template + dogfood copy, kept identical).
- `src/modules/lawbook/assets/skills/draft/SKILL.md` + `ai-specs/skills/draft/SKILL.md`
  — the `reports/README.md` guidance points at the skeleton.
- `src/modules/foundation/assets/docs/standards/testing-standards.template.md`
  + `docs/standards/testing-standards.md` — Reports section strengthened.
- `src/cli/commands/update.ts` — new `0.1.13` migration entry with the
  agent prompt for the personalized standard.
- `package.json` — version bump to `0.1.13`.

## Version coordination

This change owns the **single** `0.1.13` bump for the release: its `MIGRATIONS`
entry is tagged `0.1.13` and only fires once the package ships at that version.
So this PR is the **last to merge** — its version bump is the one deploy trigger.
The sibling change `opt-in-refresh-backups` deliberately carries **no** version
bump (no migration; its behavior ships with the code and its `*.bak` gitignore
auto-applies on the next update) and merges **first**, on `0.1.12`. One bump, one
deploy, no tag collision.
