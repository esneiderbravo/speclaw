# CLAUDE.md — speclaw Agent Operating Rules

Agent rules for the **speclaw** repository (a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project — Foundation, Compass, Lawbook; 100% local).
These rules are STRICT. Read this file at the start of every session.
Cross-agent context: [`AGENTS.md`](AGENTS.md) · The law: [`LAWS.md`](LAWS.md)

---

## Rule 0 — The Law comes first

Read [`LAWS.md`](LAWS.md) before writing or changing any code. It is the
constitution: it binds the individual standards below. Open the standard that
governs the area you're touching **before** touching it:

| You're working on… | Read first |
|--------------------|-----------|
| Anything | [`docs/standards/base-standards.md`](docs/standards/base-standards.md) |
| Structure / boundaries | [`docs/standards/architecture.md`](docs/standards/architecture.md) |
| Backend code | [`docs/standards/backend-standards.md`](docs/standards/backend-standards.md) |
| Frontend code | [`docs/standards/frontend-standards.md`](docs/standards/frontend-standards.md) |
| Tests / gates | [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md) |
| Docstrings / API comments | [`docs/standards/documentation.md`](docs/standards/documentation.md) |
| Branches / PRs / tickets | [`docs/standards/conventions.md`](docs/standards/conventions.md) |
| Any non-trivial change | [`docs/standards/lawbook.md`](docs/standards/lawbook.md) |

When any instruction conflicts with a standard, **the standard wins** — and if
you believe it is wrong, propose an amendment via a spec change; never silently
ignore it.

## Rule 1 — Compass first, always

This repo is indexed by Compass, speclaw's local code graph (`.speclaw/`). For
**any** question about code — what a symbol is, what it uses, who calls it,
where it lives, how a value flows — call Compass **first**: `compass_find` /
`compass_explore` to locate and read a symbol with its callers
and callees, `compass_impact` (grouped by module; `format: flat` for the old list) /
`compass_trace` for blast radius and call paths, `compass_affected_tests` /
`speclaw affected-tests --from-diff` for which tests to run,
`compass_hotspots` / `speclaw hotspots` (activity × AST health, default 90d)
and `compass_coupling` / `speclaw coupling` (Jaccard strength, `in_graph`,
`isTestPair`). Run `compass_index` first if the graph is missing. Schema **9**
stores `embedding_cache`, Merkle `dir_hashes`, and `node_metrics` — reindex with
`speclaw index` after a schema bump (8→9 migrates embeddings).

This includes files you already know the name of: to learn what `Foo` imports,
uses, or depends on, run `compass_explore Foo` — do **not** `cat`/`sed`/`grep`/
Read the file to work it out by hand. "I know which file it is" is not an
exemption.

Fall back to Grep / Read / `sed` / `cat` **only after** you can name which of
these holds: (1) a Compass call actually ran and returned nothing useful for the
query, (2) the graph is missing and `compass_index` can't be run, or (3) the
target is not indexed code — stylesheets, JSON/config, markdown, logs,
generated files, lockfiles. Never skip Compass because grep "feels faster."
See [`docs/compass.md`](docs/compass.md).

## Rule 2 — Spec-driven, always

No non-trivial change lands without a lawbook change (propose → implement →
verify → archive). Artifact volume follows the **confirmed ceremony level** in
`change.json` (0=quick … 3=full); missing `change.json` is still full ceremony
(level 3). Propose/set/promote with `lawbook_level` / `speclaw lawbook level`;
level 0 scaffolds via `speclaw quick`. Bugs use `speclaw lawbook draft --bug`
and `bugfix.md` (repro + regression + prevention) with `changeType: bug`;
`lawbook_investigate` / the investigate skill for graph-backed RCA first —
feature ceremony is unchanged. Security-withheld mode is not in this release.
The rules are in
[`docs/standards/lawbook.md`](docs/standards/lawbook.md);
the workflow skills live in `ai-specs/skills/` and the `/lawbook` commands wrap
them. A change is not done until it is archived — archiving belongs in the PR.
Requirement → impl → test coverage is `speclaw coverage` / `lawbook_coverage`
(ids like `req~name~1`, `// Covers:` comments). Sealed spec↔code drift is
`speclaw drift` / `lawbook_drift` (committed `lawbook/anchors/*.json`, dual
body/norm hashes).

## Rule 3 — Quality gates are non-negotiable

- Lint + format: `npm run check` (Prettier `--check` + ESLint); `npm run format` to fix
- Type-check + compile: `npm run build` (strict `tsc` + asset copy)
- Tests: no unit-test runner yet — the gates above are the compile-time gates;
  add `node:test` coverage with new behavior and verify runtime via the CLI.

Run them yourself and report real output. Never claim success you did not
observe. Full rules:
[`docs/standards/testing-standards.md`](docs/standards/testing-standards.md).

## Rule 4 — Conventions

Branches `<type>/<short-slug>` (no ticket prefix), commits in Conventional
Commits style (`type(scope): imperative summary`, English, lowercase), code that
reads like its neighbors, comments that carry constraints (never ticket IDs). Full rules:
[`docs/standards/base-standards.md`](docs/standards/base-standards.md) and
[`docs/standards/conventions.md`](docs/standards/conventions.md).

## Rule 5 — Skills are law-adjacent

Skills, commands, and subagents live in `ai-specs/` (symlinked into
`.claude/`, `.cursor/`, `.codex/`, `.agents/`). When a skill matches the
task, use it — do not improvise a parallel process.

## Rule 6 — Stop conditions

Stop and ask the user before: destructive operations (deletes, force-push,
schema drops), writing to a real data store (DB rows or files holding real user
data — including to set up or tear down test data; verification runs against an
isolated/throwaway store instead), publishing anything outward-facing (PR
reviews, tickets, comments), or any action that contradicts a standard.

## Operator notes

- `speclaw budget` reports always-on context cost. `speclaw init --minimal` /
  `SPECLAW_MINIMAL=1` omit setup MCP tools (no server-side `defer_loading`).
- `speclaw doctor --json` is the support report (redacted by default). Stable
  install: `npx @esneiderbravo/speclaw@latest init`.
- Optional `.speclaw/affected.json` overrides affected-test globals/test globs.
  After a Compass schema bump (now **9**, embedding cache + Merkle), reindex
 with `speclaw index` (8→9 preserves embeddings); photograph bodies once with
 `speclaw drift --reseal` if anchors are new or stale. Hotspots/coupling
 default history window is 90 days.
- Ceremony levels 0–3 live in `change.json`. `speclaw quick` scaffolds level 0;
  `lawbook_level` / `speclaw lawbook level` propose/set/promote. Optional
  `ceremony:` in `lawbook/config.yaml` (cuts default `[3, 8, 15]`).
- Bugs: `speclaw lawbook draft --bug` + `bugfix.md`; RCA via `lawbook_investigate`.
