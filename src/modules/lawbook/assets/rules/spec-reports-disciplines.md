---
description: Require one test report per discipline a change touches (an open set — backend, frontend, api, database, infra, security, performance, e2e, …), with the api report mandatory whenever the change touches an API surface.
alwaysApply: true
---

# Spec Reports: Discipline Coverage

A change's evidence of testing lives under `lawbook/changes/<name>/reports/`, as
**one file per discipline the change actually touched**, named for that
discipline (`<discipline>.md`) — never a single lumped report.

## 1. The set of disciplines is open — name what the change touched

There is no fixed list. Write a report for each area of concern the change
exercised, and omit the ones it did not. Common disciplines include, but are
**not limited to**:

- **`backend.md`** — domain/service logic, persistence, jobs.
- **`frontend.md`** — UI flows, components, client state.
- **`api.md`** — the endpoint contract itself (see §2).
- **`database.md`** — schema changes, migrations, data integrity.
- **`infra.md`** — IaC, CI/CD pipelines, deployment/runtime config.
- **`security.md`** — authn/authz, secrets, attack surface.
- **`performance.md`** — benchmarks, load, latency budgets.
- **`e2e.md`** — full cross-service or cross-layer journeys.
- **`mobile.md`**, **`contract.md`**, **`data.md`**, **`accessibility.md`**, …

When a change touches a concern none of these names fit, coin a clear
`<discipline>.md` for it rather than folding it into an ill-fitting bucket. The
goal is that the evidence a reviewer needs for each concern is where they expect
it — not that reports match a checklist.

## 2. The API report is mandatory whenever an API surface is touched

`api` is called out because it is the discipline most often (wrongly) absorbed
into `backend` and lost. When a change **adds or modifies an API surface** — a
new or changed endpoint, its request/response contract, its status codes, or its
auth/permission or ordering guarantees — you MUST write `api.md`. This is not
optional:

- A `backend.md` unit report does **not** substitute for it — the contract
  (shape, status codes, auth, ordering) is a distinct concern a service-unit
  report does not capture.
- A `frontend.md` report does **not** substitute for it either.

A change that touches no endpoint or contract MAY omit `api.md`.

`api.md` MUST document the contract: the method and path, the auth and
permissions required, the response shape and **every** status code the change
governs (e.g. `200`/`401`/`403`/`404`), and any ordering or consistency
guarantee. It MUST record how the contract was exercised — a test client and/or a
live request such as `curl` — and, per the verification-safety rule, how that
exercise stayed isolated from any live data store (read-only, ephemeral store, or
rolled-back transaction — never a write to real data without authorization).

## 3. Every report follows the required structure

Regardless of discipline, each report keeps the fixed structure so evidence is
reproducible, not improvised: title + header (discipline · change · date ·
branch · cwd) → gates-and-results table (each check, exact command, real result
with pass/fail counts) → tests added/updated → spec-scenario coverage table
(every `#### Scenario` mapped to how it was verified) → pre-existing/unrelated
failures (with proof, or "none") → pending manual steps (or "none") → one-line
verdict. See the `build` skill (Step 5) and
`docs/standards/testing-standards.md`.

When a test kind does not yet apply (e.g. no unit runner), the report says so in
place of that evidence and records the gates and manual verification that stood
in.

## 4. Reports gate the archive

`lawbook_archive` refuses to archive while `reports/` holds no discipline report
(the `reports/README.md` scaffold does not count). Which disciplines a change
touched — and therefore which reports are owed, including `api.md` for any
API-touching change — is the agent's responsibility to judge and satisfy before
archiving; the engine gate counts files but cannot infer the set of concerns a
change exercised.
