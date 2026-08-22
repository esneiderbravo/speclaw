# add-doctor-provenance — operational trust: `doctor --json`, provenance, distribution

## Why

Adoption fails in three moments that have nothing to do with product features:
minute-one install friction, support ping-pong when something breaks, and trust
when a package writes agent-readable instructions into a repo. Roadmap piece
6/19 ([`docs/roadmap/platform/doctor-provenance.md`](../../../docs/roadmap/platform/doctor-provenance.md))
is the multiplier for the rest of the roadmap.

Ground truth from explore (do not re-litigate in build):

- `src/modules/foundation/doctor.ts` already exists as a flat
  `Check[]` (`{ name, ok, detail }`) — this change **restructures** it, it does
  not invent the command.
- `.github/workflows/publish.yml` already uses npm Trusted Publishing
  (`id-token: write`). `@esneiderbravo/speclaw@0.3.4` already carries SLSA
  provenance attestations on the registry. The gap is **documentation,
  verification UX, workflow hardening, and badges** — not inventing OIDC.
- There is no issue template, no `CHANGELOG.md`, no stable one-liner contract in
  `CONTRIBUTING.md`, and the README buries `npx @esneiderbravo/speclaw@latest init`.
- Compass `meta` has `schema_version` only — `indexed_at` must be written for
  freshness checks (additive; no schema bump required).

## What

- Versioned **`DoctorReport`** (`schemaVersion: 1`) with five sections
  (environment, configuration, authentication, connectivity, notes), stable
  check ids, `remedy` on every `warn`/`error`, and CLI flags
  `--json` / `--offline` / `--strict` / `--redact` (default on) / `--no-redact`.
- Path **redaction** by default so reports are safe to paste into public issues.
- **GitHub issue templates** requiring `speclaw doctor --json`.
- README + CONTRIBUTING: **stable one-liner**
  `npx @esneiderbravo/speclaw@latest init`, multi-agent auto-detection pitch,
  provenance verification commands, CI + provenance badges.
- Harden and **document** the existing publish path (run `check` + `test` before
  publish; document trusted-publisher setup; revoke long-lived tokens in
  CONTRIBUTING). Add a unit test that asserts the workflow contract.
- **`speclaw telemetry status`** only: reports that speclaw ships **no**
  telemetry code (stronger than "opt-in off").
- Start **`CHANGELOG.md`**; bump package version for npm auto-publish (roadmap
  cadence — always).

## Non-goals

- **Full opt-in telemetry pipeline** (`enable`/`disable`/`log` with payloads) —
  deferred; posture is "no telemetry in the package".
- **MCP Registry product features** that depend on preview registry uptime —
  `server.json` + Claude `marketplace.json` are **P1 follow-ups**, not this
  change's Definition of Done.
- **Homebrew / Docker / Marketplace Action** (P2).
- **Public `ROADMAP.md` mirror** of gitignored `docs/roadmap/` (process, not
  this PR).
- **`law-integrity` file pinning** — later piece; provenance is one layer only.
- Renaming or consolidating MCP tools (`tool-surface`).
- Making `doctor` a merge gate that fails on warnings (that is `verify`).

## Migrations

- Package version bump (next patch after current published line) so
  `.github/workflows/publish.yml` publishes on merge to `main`.
- `MIGRATIONS` entry for that version: agent prompt for personalized docs to
  mention `speclaw doctor --json` for support and the stable one-liner; ensure
  `docs/compass.md` map markers remain (carried from 0.3.5).
- Compass writes `meta.indexed_at` on index (additive key). No
  `SCHEMA_VERSION` bump.
