# Require an API discipline report alongside backend and frontend

## Why

speclaw's discipline reports are the evidence that a change was actually
tested. Today the library names only `backend.md` and `frontend.md` as example
disciplines (the `spec-tasks-mandatory-steps` rule, the `build` skill Step 5,
`testing-standards.md`, and the `lawbook-workflow` spec). The **API contract** —
the request/response shape, status codes, auth, and ordering of an endpoint — is
a distinct discipline that neither a backend unit report nor a frontend report
captures on its own.

Real changes already produce it: the FAR-1087 change in `ftd-adt` ships three
reports — `backend-checks.md`, `frontend-checks.md`, and a dedicated
`api-tests.md` that documents the endpoint contract (200/401/403/404, the JSON
shape, the ordering guarantee, and how it was exercised without mutating a live
store). The library should make that the norm, not an ad-hoc practice, so any
change touching an API surface leaves the contract evidence behind.

## What

- Reframe discipline reports as an **open set** — one report per discipline a
  change touched, named for that discipline — rather than a closed
  backend/frontend enumeration. `backend.md`, `frontend.md`, and `api.md` are
  common; `database.md`, `infra.md`, `security.md`, `performance.md`, `e2e.md`,
  and others are written whenever the change exercises those concerns. This
  avoids limiting the evidence a change can carry.
- Make the `api` report **mandatory whenever a change touches an API surface** —
  a new or modified endpoint / contract — rather than optional. Backend and
  frontend remain mandatory-when-touched as before; a change that touches none
  of a discipline still omits it.
- Define what the `api` report must carry: the endpoint contract (method, path,
  auth/permissions), the response shape and status codes, ordering/consistency
  guarantees, and how the contract was exercised (test client and/or `curl`)
  without mutating a live store — reusing the existing required report structure.
- Ship this as a **library rule** (`ai-specs/rules/`, sourced from
  `src/modules/lawbook/assets/rules/`) so every speclaw-initialized project
  inherits it, and align the `build` skill (Step 5), the `draft` skill's
  reports-scaffold guidance, `docs/standards/testing-standards.md`, and
  `lawbook/config.yaml` to name `api` explicitly.

## Non-goals

- No change to the archive gate mechanics (it still requires at least one
  discipline report; it does not — in this change — grow to assert an `api.md`
  specifically, because "touches an API surface" is a judgment the engine cannot
  make deterministically from files alone). The obligation is enforced as a rule
  the agent follows, matching how backend/frontend are enforced today.
- No change to the required report **structure** (header · gates table · tests ·
  spec-scenario coverage · pre-existing failures · pending manual · verdict).
- No new MCP tool, CLI command, or migration.

## Migrations

None.
