# Proposal — update-refreshes-managed-files

## Why

`speclaw update` upgrades the package but leaves already-scaffolded files
untouched: `copyRendered` skips any file that already exists
(`src/shared/install.ts:46`), `scaffold` is additive, and the `MIGRATIONS` array
is empty (`src/cli/commands/update.ts:26`). So when a release improves the rules
or workflow — the Compass-first rule, the sync reconciliation, the reports /
archive gate — a project that already has speclaw upgrades the binary yet keeps
the **old files**, and never receives the change. Updating that does not update
is a contradiction.

Blind overwrite is not the fix: at `init` the agent fills `LAWS.md`,
`CLAUDE.md`, `AGENTS.md`, and `docs/standards/*` with the project's real
architecture and conventions (`src/cli/commands/init.ts:146`). Overwriting those
would destroy the user's work — which is why the writers skip existing files
today. The fix must split scaffolded files by **who owns them**.

A related paper cut: the `init` handoff and every prompt speak of pasting into a
named agent (the primary chosen agent, defaulting to Claude —
`init.ts:144`). speclaw is agent-agnostic; the wording should address "the agent
you're using", not a specific product.

## What

1. **Classify scaffolded files by ownership.**
   - **Managed** — speclaw's workflow machinery the user is not meant to edit:
     `ai-specs/skills/**`, `ai-specs/commands/**`, `ai-specs/rules/**`,
     `ai-specs/agents/**`.
   - **Personalized** — filled with project specifics at init: `CLAUDE.md`,
     `AGENTS.md`, `LAWS.md`, `docs/standards/*`, `docs/compass.md`, and
     `lawbook/config.yaml`.

2. **`update` auto-refreshes the managed files** to the current package version,
   overwriting them. When a managed file was edited locally (diverged from the
   version speclaw last wrote), it is backed up to `<file>.bak` before the
   overwrite and reported — never a silent loss. Divergence is detected with
   baseline hashes recorded in the manifest at init/update time.

3. **`update` does not auto-edit personalized files.** Instead it prints an
   agent-generic prompt describing exactly what changed in the personalized
   templates for the versions being crossed (e.g. "Rule 1 → Compass-first",
   "add the reports mandatory step to `lawbook/config.yaml`"), for the user to
   run **with the agent they use** to apply the changes while preserving their
   project-specific content.

4. **Agent-generic language.** The `init` handoff and the new `update` prompt say
   "the agent you're using" / "your agent" rather than naming Claude.

## Non-goals

- No automatic edits to personalized files — reconciling project-specific content
  is the agent's job, driven by the generated prompt.
- No merge engine for personalized files (no three-way merge / marker regions in
  this change); the agent prompt covers them. Marker regions may be a later
  change.
- The managed-file overwrite is not configurable per-file in this change; the two
  buckets are fixed lists.

## Migrations

The manifest gains a `baselines` map. Projects updated from a version without it
simply have no baselines yet: on the first refresh, a managed file that differs
from the shipped template is treated as diverged and backed up to `.bak` (safe
default), and baselines are written going forward.
