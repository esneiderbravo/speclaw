# Proposal: Multi-agent Cortex (CORTEX)

## Why

Speclaw installs skills/commands that a **single** host agent runs end-to-end,
plus an optional pack of domain planning agents (backend/frontend/product).
There is no orchestrator, no review/test roles, no per-stage permissions, and
no durable cycle state. Cursor does not even symlink `ai-specs/agents`.

Users need a default **multi-agent loop**: a primary coordinator dispatches
explore → plan → implement → review → test → archive, each role with its own
permission profile, reworking until archive gates pass. Speclaw stays
local-first (no LLM runtime): it defines roles, state, and gates; the host
spawns subagents.

## What changes

1. **Cortex module** — `src/modules/cortex/` with durable
   `lawbook/changes/<name>/harness.json`, MCP tool `cortex`
   (`status` | `start` | `advance` | `rework` | `brief`), and CLI
   `speclaw cortex …`. Brand: **Cortex — One brain. Many agents.**
   `lawbook_change` action `harness` / `speclaw lawbook harness` remain
   thin aliases for one release.
2. **Archive gates** — review PASS (levels ≥1) and test PASS required before
   `lawbook_archive`.
3. **Cortex skill + command** — primary follows `cortex` / `/lawbook/cortex`;
   build stops after implementation (tester owns gates/reports; archiver owns
   sync/archive).
4. **Role agents** (lawbook assets, always installed): explorer, planner,
   implementer, reviewer, tester, archiver (+ coordinator contract in
   AGENTS.md). Domain pack agents **removed**; pack `agents` deleted.
5. **Host wiring** — Cursor/Codex/Windsurf gain `agents` in `linkTargets`; init
   skips pack prompt when the catalog is empty.
6. **Canonical surface** — nine MCP tools (adds `cortex`).

## Non-goals

- Speclaw does not call cloud LLMs or spawn processes that run models.
- Pack infrastructure may remain as an empty catalog for future opt-in packs;
  the shipped `agents` pack and its three domain agents go away.
- Cortex is an in-repo module (sibling to Compass/Lawbook), not a separate npm
  package.

## Capabilities

- Extends `lawbook-workflow`.
- Extends MCP surface / context-budget (9 canonical tools).
