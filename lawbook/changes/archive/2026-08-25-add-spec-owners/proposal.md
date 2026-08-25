# add-spec-owners — CODEOWNERS from declared capability ownership

## Why

Teams need a clear answer to *who approves a change to this spec*. GitHub
already speaks `CODEOWNERS`; speclaw already owns `lawbook/config.yaml` and
writes managed blocks elsewhere (hooks). Declaring ownership once next to the
lawbook config and compiling it into a **last** managed `CODEOWNERS` block
gives governance without a new cloud service.

Roadmap **team-mode** E1 only (#19 slice). Explore (2026-08-25) locked:

| # | Decision |
| --- | --- |
| 1 | **E1 only** — `team.owners` → managed `.github/CODEOWNERS` block |
| 2 | **No new MCP tool** — CLI `speclaw owners` + `doctor` only |
| 3 | **No** `deriveFromTraceability` in v1 (manual owners only) |
| 4 | Ceremony **level 3** |

## What

1. **`team.owners` in `lawbook/config.yaml`** — map capability (or `"*"`) → list of
   `@user` / `@org/team` / email owners.
2. **Compiler** writes a marked block `# >>> speclaw:owners` … `# <<< speclaw:owners`
   **always at the end** of `.github/CODEOWNERS` (GitHub: last match wins).
3. **Non-destructive merge** — preserve user content outside markers; rewrite
   only the speclaw block.
4. **`speclaw owners --write`** (and a check/diff mode) — human CLI; no MCP.
5. **Doctor** — error if content exists after the end marker; warn on invalid
   owner syntax; warn that CODEOWNERS is decorative without *Require review
   from Code Owners* (document, do not automate branch protection).
6. **Init/update** refresh the block when `team.owners` is present; dogfood
   speclaw's own owners map.

## Non-goals

- E2 change locks, E3 OTel metrics, E4 dashboard, E5 issue sync.
- `deriveFromTraceability` code-path ownership.
- New MCP tool or raising the 8-tool budget.
- Automating GitHub branch-protection toggles.
- Requiring GitHub API (optional network validation never blocks local doctor).

## Migrations

Additive and opt-in: absent `team.owners` ⇒ no CODEOWNERS mutation. Crossing
the release surfaces a migration / agent prompt describing `team.owners` and
`speclaw owners --write`.

## Capabilities

- `spec-ownership` (**new**) — compile + merge + validation rules for the block
- `cli` — `speclaw owners` surface; help; no new MCP
- `operational-trust` — doctor checks for owners posture
- `project-update` — init/update refresh + migration note
