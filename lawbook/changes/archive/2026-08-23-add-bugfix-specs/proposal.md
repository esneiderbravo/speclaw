# add-bugfix-specs — bug change type and graph-backed investigation

## Why

Most SDD tools assume every change is a new feature. Real teams spend most of
their time on **"this is broken"** — and forcing bugs through `proposal.md` +
`design.md` produces empty ceremony (Fowler's nut-and-hammer) without the
discipline bugs actually need: reproduction, regression tests, and prevention.

Kiro ships **Bugfix Specs** as a first-class change type; speclaw has adaptive
ceremony (#11, shipped 0.3.12) but still only feature-shaped artifacts. Roadmap
**bugfix-specs** (#12) closes the gap with a dedicated `bugfix.md` mold and a
deterministic **`lawbook_investigate`** tool that ranks suspects from the code
graph — not LLM guesswork.

The prevention section (§7) closes speclaw's product loop: reactive fixes feed
executable laws.

## What

1. **`changeType: "bug"`** in `change.json` (default `"feature"` for legacy
   changes).
2. **`speclaw lawbook draft --bug <name>`** — scaffolds `bugfix.md` (seven
   sections) instead of `proposal.md` / `design.md`; records type in metadata.
3. **Level × bug artifact matrix** — extends adaptive-ceremony gates:
   - **0** — `bugfix.md` (sections 1–3, 5–6 required; 4/7 may be `n/a` with
     reason) + `reports/`.
   - **1** — full `bugfix.md` + `tasks.md` + optional delta spec + `reports/`.
   - **2–3** — `bugfix.md` + `design.md` (structural fix).
4. **Bug-specific validate/archive gates** — reproduction (or `unreproducible:`),
   regression test (or instrumentation for mitigated), prevention answered;
   resolutions `fixed` | `mitigated` | `not-a-bug` recorded on archive.
5. **`lawbook_investigate` MCP** (+ CLI `speclaw lawbook investigate`) —
   stack-trace parse (V8/Python), graph scoring (explore, impact, hotspots,
   coupling, affected-tests, recall, git lastTouch), deterministic ranking with
   `reasons[]`; optional pre-seed of `bugfix.md` sections 1, 3 (candidate), 4.
6. **Skills/commands** — `investigate` asset (separate from `explore`); draft
   skill `--bug` branch; spec-reports rule: bug reports include failing test
   output **before** the fix.
7. **Doctor** — informational feature vs bug distribution among archived changes.
8. **Version 0.3.13** — update migration note; `lawbook_investigate` in
   `MINIMAL_OMIT`.

## Non-goals (v1)

- **`severity: security`** / `--disclose` withheld-detail mode (deferred)
- **`verify --ci` revert-fix regression gate** (separate spike)
- Configurable investigate score weights
- Stack traces for Java/Go/Rust
- FTS5 / full-repo error-string search

## Migrations

No Compass schema bump. Additive Lawbook metadata, MCP tool, CLI flags.
Existing changes without `changeType` remain features. Target **0.3.13**.

## Decisions locked in explore

| Decision | Choice |
| --- | --- |
| Scope | **Single change** — artifact + investigate together |
| Security bugs | **Deferred** — normal severity only in v1 |
| CLI entry | **`speclaw lawbook draft --bug`** |
| Investigate skill | **New asset** (`investigate.md` + skill), not explore branch |
| Score weights | **Fixed** in code + design.md |
| Delta spec for bugs | **Optional** unless prevention says a requirement was missing |
| Pre-seed bugfix.md | Sections **1, 3 (candidate), 4** only |
| Recurrence detection | **In scope** — archived `bugfix.md` root-cause cross-check |
