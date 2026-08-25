# add-law-integrity — committed rule lockfile + injection scan

## Why

speclaw writes files that agents treat as trusted instructions (`AGENTS.md`,
`CLAUDE.md`, `.cursor/rules/*`, skill packs). The **Rules File Backdoor** is a
boring PR edit nobody reviews. Competitors do not pin rule files cryptographically
because they do not generate them deterministically. speclaw does.

Roadmap **law-integrity** (#18). Explore (2026-08-25) locked:

| # | Decision |
| --- | --- |
| 1 | **Full scope** — lockfile + content scan + human `accept` + CI + dogfood |
| 2 | **No new MCP tool** — surface via `speclaw verify` / `speclaw laws …` |
| 3 | **Strict** — `AGENTS.md` / `CLAUDE.md` / compiled rules fail verify on digest mismatch; `docs/standards/*` warns |
| 4 | **Skills/packs scanned** (descriptions inject every turn) |
| 5 | Ceremony **level 3** |

## What

1. **`speclaw.lock`** at repo root (committed, never under `.speclaw/`).
2. **Canonical digests** (LF, strip provenance block, trim EOL) + `root` hash.
3. **`verifyIntegrity`** (new name — do **not** overload existing `verifyLaws` deps/graph) wired into `speclaw verify` / optional `laws` subcommands.
4. **Injection scanner** with normalize + detectors; skills/packs included.
5. **`speclaw laws accept`** — interactive TTY only; records `accepted[]`; never MCP.
6. **Doctor** — fast root check, external `@import` hops, outside-pipeline listing.
7. **Init/update/compile** refresh the lock; dogfood speclaw's own `speclaw.lock` in CI.

## Non-goals

- Sigstore / minisign signing of the lock (v1).
- New MCP tool (`laws_verify`).
- LLM-based semantic injection detection.
- Putting the lockfile under `.speclaw/` (gitignored ⇒ invisible in PRs).
- Agent-callable digest acceptance.

## Migrations

Additive: new root file `speclaw.lock`, new modules under `foundation/`, CLI
subcommands, verify findings. Missing lockfile ⇒ exit 0 + baseline instructions
(does not break existing CI).

## Capabilities

- `law-enforcement` — integrity verify in the verify pipeline; SARIF findings
- `operational-trust` — doctor integrity / import / outside-pipeline checks
- `cli` — `laws lock|accept|scan`, verify integrity messaging
- `project-update` — init/update/compile refresh `speclaw.lock`
