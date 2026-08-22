# Write the discipline reports (mandatory)

Record the evidence of testing under `lawbook/changes/<name>/reports/`, one file
per discipline the change touched, named for that discipline. The set is **open,
not a fixed list** — `backend.md`, `frontend.md`, and `api.md` are the common
ones, but write `database.md`, `infra.md`, `security.md`, `performance.md`,
`e2e.md`, etc. when the change exercises those concerns, and coin a clear
`<discipline>.md` for anything none of them fit. Omit disciplines the change did
not touch; the archive is blocked until at least one discipline report exists.

**`api.md` is mandatory whenever the change touches an API surface** — a new or
modified endpoint, its request/response contract, its status codes, or its
auth/permission or ordering guarantees. A `backend.md` unit report does not
substitute for it: the contract is a distinct concern. In `api.md` document the
method and path, the auth/permissions, the response shape and every status code
the change governs (e.g. `200`/`401`/`403`/`404`), any ordering guarantee, and
how the contract was exercised (test client and/or `curl`) — kept isolated from
any live data store per the manual-verification step.

Each report MUST follow this structure, in order — the fixed shape is what makes
the evidence trustworthy and reproducible, rather than left to improvisation:

1. **Title + header** — `# <Discipline> checks — <change> (<date>)`, then a line
   `Date · Branch · Environment/cwd` naming where the commands ran.
2. **Gates & results** — a `| Check | Command | Result |` table: each gate, the
   exact command, and its real result with pass/fail counts (e.g. "62 files, 434
   passed") and ✅/⚠️/❌. Quote real output — never paraphrase a green you did
   not see.
3. **Tests added / updated** — each new or changed test and what it asserts; note
   TDD evidence ("failed before the fix, passes after") where it applies.
4. **Spec-scenario coverage** — a table mapping each `#### Scenario` in this
   change's delta specs to how it was verified (a test id, a gate, or a manual
   step). Every scenario must appear.
5. **Pre-existing / unrelated failures** — any failing check not caused by this
   change, with proof it is pre-existing (e.g. it reproduces with the change
   stashed) — or state "none".
6. **Pending manual steps** — anything not automated, stated plainly — or "none".
7. **Verdict** — one line.

If a test kind does not yet apply (e.g. no unit runner), the report says so in
place of that evidence and records the gates and manual verification that stood
in.

Next: read `steps/07-hand-off.md` and do only what it says.
