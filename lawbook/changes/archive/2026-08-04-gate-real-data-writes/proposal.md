# Gate real-data writes during verification

## Why

speclaw now mandates that `build` verifies behavior and records evidence in
discipline reports. That is good — but it created a dangerous incentive the law
never fenced: to "prove" a feature works, an agent will exercise the running app
and, to get observable results, **mutate real data**. Neither the `build` skill
(Step 4) nor the testing standard says anything about *which* store verification
may touch, so the path of least resistance is the real one.

This already bit a real project. During verification an agent:

- hit real `POST`/`DELETE` endpoints against the live development database, and
- ran **raw SQL** (`UPDATE …`, `DELETE …`) directly against the live SQLite file.

It took a backup first — then worked on the **original**, not the copy — and left
a stray value behind that was caught only by luck. Data loss and silent
corruption of the user's real data is exactly the class of bug this tool exists
to prevent, and here the tool's own workflow encouraged it.

An agent creating, updating, or deleting the user's real data as a side effect
of building or testing a feature is a **destructive, unauthorized act**. The law
must treat it as one.

## What

Add a hard rule, at the level of a **stop condition**, that:

1. Verification is **isolated by construction** — it runs against an ephemeral or
   throwaway store (a temporary copy, an in-memory database, a dedicated test
   store) or inside a transaction that is rolled back. This is the default and
   should make real-store writes almost never necessary.
2. **Any** write to a real store — a production/development database, or files
   holding the user's real data — including seeding or tearing down test data and
   running raw store commands (e.g. direct SQL) against a live store, requires
   the agent to **stop and ask first**, stating exactly what it will write and to
   which store, and proceed only after explicit authorization. A backup is not a
   substitute for authorization.
3. The discipline report records **how verification was isolated** (or the
   authorization obtained).

The rule lands in four places so it is unmissable and inherited by every speclaw
project:

- `build` skill, Step 4 (managed — refreshes automatically).
- `docs/standards/testing-standards.md` — the manual/e2e verification section.
- `docs/standards/base-standards.md` and `CLAUDE.md` / `AGENTS.md` — elevated
  into the existing **Rule 6 / stop-conditions** list.

## Non-goals

- No tooling to detect or sandbox writes automatically — this is a rule enforced
  by the agent and the standards, like every other stop condition.
- No change to how a feature's own schema **migrations** are written; those are
  still authored normally. Running a migration against a real store is itself a
  real-store write, so it falls under the same authorization gate.

## Migrations

Yes. The stop-condition text lives in **personalized** files (`CLAUDE.md`,
`AGENTS.md`, `docs/standards/base-standards.md`, `docs/standards/testing-standards.md`),
which `speclaw update` cannot rewrite. A migration entry tagged at the release
that ships this change (`0.1.14`) prints an agent prompt describing the clause to
add. The `build` skill is managed and refreshes automatically.
