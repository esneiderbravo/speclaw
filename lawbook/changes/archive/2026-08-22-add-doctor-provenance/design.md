# Design — add-doctor-provenance

## Approach

Operational trust is three surfaces over one diagnostic core:

```
src/modules/foundation/
  doctor.ts     ← RESTRUCTURE: DoctorReport + sections + check registry
  redact.ts     ← NEW: path / username redaction (POSIX + Windows)
src/cli/commands/doctor.ts
                ← EXTEND: --json --offline --strict --redact/--no-redact; exit codes
src/cli/commands/telemetry.ts
                ← NEW: status only ("no telemetry in this package")
src/modules/compass/db.ts | indexer.ts
                ← WRITE meta.indexed_at on successful index
src/cli/lib/update-check.ts
                ← reused as conn.registry (skippable via --offline)
.github/ISSUE_TEMPLATE/*
.github/workflows/publish.yml  ← harden; do not reinvent OIDC
README.md / CONTRIBUTING.md / CHANGELOG.md
docs/schemas/doctor-report-v1.json
```

Layering: report construction stays in `foundation/doctor.ts`; redaction is a
pure helper (foundation or shared — prefer `foundation/redact.ts` because only
doctor consumes it in v1; move to `shared/` if a second caller appears). CLI
stays thin. MCP `doctor` tool returns the same structured report (JSON text),
not a second shape.

## Decisions (from explore)

| Decision | Choice | Rejected |
| :-- | :-- | :-- |
| Exit codes | **0 with warnings; non-zero only on `error`; `--strict` makes warnings fail** | Non-zero on warn (breaks agent startup / noise) |
| Telemetry | **No send path; `telemetry status` states absence** | Ship disabled pipeline "for later inspection" |
| Primary install | **`npx @esneiderbravo/speclaw@latest init` as frozen one-liner** | Global-first tip as the contract |
| Provenance workflow | **Document + harden existing OIDC publish** (already attesting) | Rewrite trigger to `release: published` (would break bump-on-main cadence) |
| MCP reachability v1 | **Config present + command resolvable + in-process tool count via `buildServer` / probe handshake against self** | Talking to the host IDE's MCP client |
| Freshness warn | **Age > 7 days AND tracked files changed since `indexed_at` → `warn`**; missing `indexed_at` → `skip` | Error on missing meta (breaks old indexes) |
| Ownership drift | **v1: skip or notes if no content-hash inventory exists**; do not invent a false "hand-edited" list | Pretend `isManaged` alone detects edits |
| Agent surfaces | Report **configured agents from `AGENTS`** (today five defs), not a hardcoded "4" | Roadmap copy saying four |
| Distribution P1 | **Out of this change** (`server.json`, marketplace) | Boiling the ocean in one PR |
| Capability | New **`operational-trust`**; delta **`cli`** for flags/header/telemetry | Folding everything into `cli` (buries provenance + privacy) |

## Check status model

`CheckStatus = "ok" | "warn" | "error" | "skip"`. Section and report status =
worst among children (`error` > `warn` > `ok` > `skip`). A `warn`/`error`
**MUST** carry a non-empty `remedy` that is a literal shell command when one
exists; otherwise demote to `notes`.

Stable check ids (frozen in tests — renaming is a breaking schema change):

`env.node`, `env.platform`, `env.git`, `cfg.manifest`, `cfg.symlinks`,
`cfg.mcp.<agentId>`, `cfg.laws`, `cfg.budget`, `cfg.index.freshness`,
`cfg.specs.orphans`, `auth.none`, `conn.registry`, `conn.egress`,
`notes.compact`, `notes.capabilities`.

Optional / skip when primitives missing: `env.ast-engine` (until executable
laws ship `@ast-grep/napi`), `cfg.ownership` (until hash inventory),
`cfg.hooks` (report from existing law-enforcement doctor notes if no richer
probe).

## Redaction

Default on. Replace home directory with `~`, project root with `<project>`,
strip OS username from paths. Windows: `C:\Users\<user>\` and `\` separators.
Report field `redacted: true|false`. Never include file contents — only names.

## Publish hardening (honest about current state)

Already true: OIDC trusted publishing, provenance attestations on npm.

This change adds:

1. `npm run check` and `npm test` (or `npm run build` already present — add
   check + test) before `npm publish` in `publish.yml`.
2. CONTRIBUTING: trusted-publisher registration steps; revoke classic tokens;
   **one-liner never changes** contract.
3. README: verification (`npm audit signatures`, `gh attestation verify`) +
   provenance badge.
4. Unit test parsing `publish.yml` for `id-token: write` and absence of
   `NODE_AUTH_TOKEN` / `NPM_TOKEN`.

Optional: GitHub Environment `npm` for human approval — document as maintainer
ops; enable only if it does not block the established bump-on-main path without
a conscious decision in tasks.

## Alternatives weighed

1. **JSON-only additive flag on today's flat checks** — faster, but issue
   templates and support need sections + stable ids + redaction. Rejected.
2. **Defer all provenance work** — registry already attests; skipping docs
   wastes a free trust signal. Rejected.
3. **Ship full telemetry opt-in now** — contradicts "100% local" pitch and
   explore recommendation. Rejected for F1.

## Risks

| Risk | Mitigation |
| :-- | :-- |
| Doctor becomes a 40-line wall | Section summaries; remedy rule; human output groups by worst status |
| MCP "reachable" overclaims | Detail distinguishes unconfigured / unresolved bin / probe failed; never `error` for unreachable |
| False ownership warns | Skip until real inventory exists |
| One-liner drift in third-party directories | CONTRIBUTING contract + distribution-assets test tying README ↔ CONTRIBUTING |
