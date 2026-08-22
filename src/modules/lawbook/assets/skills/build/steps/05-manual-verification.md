# Manual verification (mandatory, agent executes)

Exercise the behavior (endpoint/UI/CLI) yourself where feasible — do not
delegate manual testing to the user. Record what you verified.

**Verification is isolated by construction — it never touches real data.** Run it
against an ephemeral or throwaway store: a temporary copy, an in-memory database
(`:memory:`), a dedicated test store, or inside a transaction that is rolled
back — best of all, verify pure/domain logic with fixtures and no store at all.
Do **not** create, update, or delete the user's real data (a production or
development database, or files holding real data) as a side effect of proving a
change, and do **not** run raw store commands (e.g. direct SQL) against a live
store. Snapshot-and-restore is not a sanctioned method — a stray write slips past
the restore.

If isolation is genuinely impossible and a real-store write is unavoidable,
**stop and ask first** — state exactly what you will write and to which store —
and proceed only after explicit authorization. A backup is not a substitute for
authorization. Record in the report how verification stayed isolated (or the
authorization you obtained).

Next: read `steps/06-discipline-reports.md` and do only what it says.
