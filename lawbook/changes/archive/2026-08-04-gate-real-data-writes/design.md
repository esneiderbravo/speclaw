# Design — gate real-data writes during verification

## Approach

Encode one principle — *verification never touches real data; a real-store write
is a gated stop condition* — and place it everywhere an agent would look while
building and verifying, so it cannot be missed:

- **Operational how-to:** `build` skill Step 4 gains the isolation default and
  the authorization gate, plus a line that the report records the isolation used.
- **The law:** the testing standard's manual/e2e section states the rule
  normatively; `base-standards` and the `CLAUDE.md`/`AGENTS.md` **Rule 6** lists
  gain "writing to a real data store" as an explicit stop condition — the same
  tier as deletes, force-push, and publishing.

The rule is a **gate**, not an absolute ban (the chosen model): the agent *may*
write to a real store, but only after stopping, stating exactly what and where,
and getting explicit authorization. In practice the isolation default means it
rarely needs to ask.

### What "isolated by construction" means

Concrete, in order of preference:

1. **No store at all** — pure/domain logic is unit-tested with fixtures; the
   best evidence needs no database.
2. **Ephemeral store** — point the app at a temporary copy, an in-memory DB
   (`:memory:`), or a dedicated test store via config/env; seed, exercise,
   discard.
3. **Transaction rollback** — wrap the exercise in a transaction that always
   rolls back, so nothing commits.

Snapshot-and-restore is explicitly **not** a sanctioned method — it is what
failed in the field (a write slips past the restore). It may be a backstop but
never the strategy.

## Alternatives weighed

- **Absolute ban (agent never writes to a real store; the user runs migrations).**
  Safest, but blocks legitimate agent-run migrations and over-constrains projects
  where the agent legitimately operates a dev store. Rejected in favour of the
  gate.
- **Leave it to the general "ask before irreversible actions" bullet.** That
  bullet already exists and did **not** prevent the incident — it is too generic;
  agents did not read "exercise the endpoint" as "mutate real data." The rule
  must name data-store writes explicitly.
- **Build a write-sandbox / interception tool.** Out of proportion and
  language/stack-specific; speclaw's enforcement model is standards + agent
  discipline, not runtime policing.

## Trade-offs

- Enforced by convention, not mechanically — consistent with every other stop
  condition here. Accepted.
- Restating the full `lawbook-workflow` capability in the delta (because
  `lawbook_sync` copies delta specs over canonical wholesale) duplicates the
  unchanged requirements. Accepted — the repo's established delta shape.
- The rule touches several personalized files, so existing projects need the
  `0.1.14` migration prompt to adopt it. Accepted; the `build` skill (managed)
  carries the operational rule immediately on update.

## Files touched

Managed (auto-refresh on update):
- `src/modules/lawbook/assets/skills/build/SKILL.md` + `ai-specs/skills/build/SKILL.md`
  — Step 4 gains the isolation default, the authorization gate, and the
  record-the-isolation line.

Personalized (shipped template + repo dogfood copy; `0.1.14` migration prompt):
- `…/assets/docs/standards/testing-standards.template.md` + `docs/standards/testing-standards.md`
  — manual/e2e section.
- `…/assets/docs/standards/base-standards.template.md` + `docs/standards/base-standards.md`
  — the "ask before irreversible actions" bullet.
- `…/assets/CLAUDE.template.md` + `CLAUDE.md` — Rule 6 stop conditions.
- `…/assets/AGENTS.template.md` + `AGENTS.md` — the stop-conditions item.

Wiring:
- `src/cli/commands/update.ts` — `0.1.14` `MIGRATIONS` entry with the agent
  prompt for the personalized files.
- `package.json` — version bump to `0.1.14`.
