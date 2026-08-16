# add-verify-ci — deterministic CI gate for declared laws

## Why

`check-dispatcher` and the graph engines already evaluate laws on the author's
machine. A pull request, a fork, or a teammate on Cursor never runs them, so a
law that is not remembered is a law that does not exist. This change puts the
same `verifyLaws` core on the merge path: a `speclaw verify` command with
documented exit codes, SARIF 2.1.0, and a GitHub workflow that `init` and
`update` drop when the file is missing. No model, no secrets, no new MCP tool.

It is the first slice of the `verify-ci` roadmap piece. Authority for what this
slice does *not* build is the explore of `docs/roadmap/runtime/verify-ci.md`
against `main`: the bot comment, two-stage spec/quality short-circuit, known-
violations baseline, `src/modules/laws/`, and unifying `check` into `verify`
are out of scope.

## What

- **`speclaw verify`** — CI orchestrator over `verifyLaws`. Formats: text,
  JSON (`schemaVersion: 1`), SARIF 2.1.0, markdown. Flags: `--ci`, `--sarif`,
  `--json`, `--format`, `--fail-on`, `--strict-engines`. Exit codes 0/1/2/3/4
  are public API. `speclaw check` and `speclaw laws verify` stay as they are.
- **Formatters in `foundation`** (`sarif.ts`, `report-md.ts`, `ci.ts`) — not a
  new `laws` module. SARIF: one rule per loaded law, repo-relative URIs, local
  fingerprint `lawId:file:line`, skips as `toolExecutionNotifications`, cap
  5.000 results. Markdown is honest: laws table only; no coverage claims.
- **Manifest in CI.** `verifyLaws` falls back to `seedManifest()` when
  `.speclaw/laws-manifest.json` is missing (clean clone). `scaffold` **appends**
  seed laws whose `id` is absent; it never overwrites an existing entry.
- **Git helpers** in `shared/git.ts`: `mergeBase`, `changedFiles`. `--ci` plus
  a shallow clone exits `3` with the `fetch-depth: 0` message. Reuses
  `isShallowRepo` from `git-history.ts`.
- **Workflow if missing.** `init`/`update` write
  `.github/workflows/speclaw.yml` from a foundation asset when the path does
  not exist; they never overwrite. This repo dogfoods with a local-build
  workflow and an `action.yml` at the package root for consumers
  (`uses: esneiderbravo/speclaw@v1`).
- **Seed `deps`/`graph` laws** for speclaw's own architecture so dogfood
  evaluates more than globs.

## Non-goals

- PR bot / `peter-evans/create-or-update-comment` / `verify report --from`.
- Two-stage spec-conformance short-circuit, trace, drift, known-violations.
- `ast` / `process` / `semantic` backends; a `src/modules/laws/` module.
- Renaming or merging `speclaw check`.
- Publishing the `v1` tag (release, not this change).
- Prompt-injection scanning of law prose (law-integrity).
- Monorepo `--root`.

## Migrations

Additive. `scaffold` writes the workflow only when missing and merges seed
laws by `id`. A `MIGRATIONS` entry at `0.3.4` carries the agent prompt for
making the check required in branch protection. No Compass `SCHEMA_VERSION`
bump.
