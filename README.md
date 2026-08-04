<div align="center">

<img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/speclaw-banner.png" width="820" alt="speclaw — where specs become law">

<br/>

<a href="https://www.npmjs.com/package/@esneiderbravo/speclaw"><img src="https://img.shields.io/npm/v/@esneiderbravo/speclaw?color=0E8E8E&labelColor=0B0F10&style=flat-square&label=npm" alt="npm"></a>
&nbsp;<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0E8E8E?labelColor=0B0F10&style=flat-square" alt="MIT"></a>
&nbsp;<img src="https://img.shields.io/badge/node-%E2%89%A522-0E8E8E?labelColor=0B0F10&style=flat-square" alt="Node >= 22">

<br/><br/>

<p align="center">
<b>AI agents are brilliant and blind</b> — brilliant at writing code, blind to <i>your</i>
project's rules. <b>speclaw</b> hands them what they're missing: the codebase's
<b>written laws</b> (a constitution built from your real code), a <b>local map</b> to
navigate it without burning tokens, and a <b>disciplined workflow</b> for every change.
<br/>
One command. No cloud, no LLM, no API keys — <b>everything runs on your machine.</b>
</p>

<img src="https://img.shields.io/badge/100%25_local-0E8E8E?labelColor=0B0F10&style=flat-square" alt="100% local">
&nbsp;<img src="https://img.shields.io/badge/no_LLM_·_no_cloud-0E8E8E?labelColor=0B0F10&style=flat-square" alt="no LLM">
&nbsp;<img src="https://img.shields.io/badge/CLI_+_MCP-0E8E8E?labelColor=0B0F10&style=flat-square" alt="CLI + MCP">
&nbsp;<img src="https://img.shields.io/badge/any_agent-0E8E8E?labelColor=0B0F10&style=flat-square" alt="any agent">

</div>

<br/>

> [!TIP]
> **Install once, then one command sets everything up.** Install speclaw globally, run
> `speclaw init`, pick the agents you use, and speclaw scaffolds the project, indexes
> your code, and hands your agent a ready-to-paste prompt to finish the setup.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Quick start

Install speclaw globally (once), then run `init` in your project root:

```bash
npm i -g @esneiderbravo/speclaw
speclaw init
```

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-quickstart.png" width="800" alt="speclaw init">
</p>

The `speclaw` command is now available everywhere — run `speclaw index`,
`speclaw visualize`, or `speclaw lawbook …` directly in any project.

`init` will:

1. **Ask which agents you use** (Claude Code, Cursor, Codex, …) — and configure
   only those. Add more later; nothing is forced on you.
2. Write the **foundation** (constitution + standards) and the **lawbook workflow**.
3. **Index your code** with a live progress bar and a summary of what it found.
4. Register the speclaw **MCP server** in each chosen agent's config.
5. Print a prompt to paste into your agent so it fills the constitution with your
   project's real architecture and conventions.

Prefer not to install globally? A one-off `npx @esneiderbravo/speclaw init` works
too (also `pnpm dlx` / `yarn dlx`) — but installing globally means you can run the
`speclaw` commands directly afterwards.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; It looks like this

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-init.png" width="800" alt="speclaw init — terminal output">
</p>

<p align="center"><i>Teal steps, green checks, a live progress bar — themed with the speclaw palette.</i></p>

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; The suite — four modules

| Module | What it does |
| :-- | :-- |
| **Foundation** | The project's constitution: `LAWS.md` binding a set of granular standards under `docs/standards/` (base, architecture, backend, frontend, testing, documentation, conventions, lawbook), plus strict `CLAUDE.md` / `AGENTS.md` agent contracts — filled from your real codebase. |
| **Compass** | speclaw's own local code graph. Parses your code (tree-sitter) into nodes + edges plus a local vector store, so an agent finds and understands code with a fraction of the tokens a grep/read loop would cost. No LLM, 100% local, lives in `.speclaw/` (gitignored). |
| **Lawbook** | speclaw's own spec-driven workflow: `draft → build → sync → archive` (and `explore`), backed by `lawbook_*` engine tools. No external CLI. |
| **Tools** | Opt-in packs of skills and subagents (currently the dev-agents) that agents use for specific tasks. |

Compass is inspired by [CodeGraph](https://github.com/colbymchenry/codegraph) and the Lawbook module by [OpenSpec](https://github.com/Fission-AI/openspec) — both MIT. speclaw reimplements the ideas as its own code and gives full credit; see [ATTRIBUTION.md](ATTRIBUTION.md).

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; The spec-driven workflow (Lawbook)

Lawbook is speclaw's answer to the biggest risk with AI agents: **code that
drifts from intent.** The intent is written first, the code is made to match it,
and the spec is promoted to the project's canonical record — so nothing
non-trivial lands without a spec change. It's a loop of five steps:

```
   ┌─────────┐    ┌───────┐    ┌───────┐    ┌──────┐    ┌─────────┐
   │ explore │ ─▶ │ draft │ ─▶ │ build │ ─▶ │ sync │ ─▶ │ archive │
   └─────────┘    └───────┘    └───────┘    └──────┘    └─────────┘
```

| Step | What happens |
| :-- | :-- |
| **explore** | Think an idea through *before* committing to it — should we do this, and how. Writes nothing. |
| **draft** | Capture the intent as a change under `lawbook/changes/<name>/` — four artifacts plus a `reports/` folder, always (see below). |
| **build** | Implement the tasks in order, keeping code and spec in agreement, and record test results under `reports/`. |
| **sync** | Reconcile the delta specs against what was actually built, then promote them into the canonical `lawbook/specs/` — the always-true description of how the system behaves. |
| **archive** | Reconcile, then validate, promote, and move the change to `lawbook/changes/archive/` — **in the same PR**, never a post-merge chore. Gated: refused while any task is unchecked, `reports/` is empty, or the specs are unsynced. |

**Every `draft` writes four artifacts under `lawbook/changes/<name>/` — none optional:**

| Artifact | What it captures |
| :-- | :-- |
| `proposal.md` | The **why** — motivation, what changes, non-goals, and whether migrations are needed. |
| `specs/<capability>/spec.md` | The **delta specs** — one per affected capability, normative and testable. |
| `design.md` | The **how** — approach, alternatives weighed, and the trade-offs behind the decision. |
| `tasks.md` | The **plan** — ordered, checkable steps, including the mandatory ones from `config.yaml`. |

Plus a **`reports/`** folder — scaffolded at draft, filled at build with one report per discipline (`backend.md`, `frontend.md`, …) recording the real unit/integration/e2e results. Evidence of testing travels with the change, and `lawbook_archive` refuses to archive without it.

> [!NOTE]
> **Delta specs are normative and testable.** Requirements use `SHALL`/`MUST`
> under `### Requirement:` headers, each with one or more `#### Scenario:` blocks
> whose acceptance criteria hold without production integrations. `lawbook_validate`
> checks that the code matches what the spec promises before you sync or archive.

**Three ways to drive it — same engine, no external CLI:**

- **In your agent** — the `/lawbook:explore`, `/lawbook:draft`, `/lawbook:build`, `/lawbook:sync`, `/lawbook:archive` commands (installed as skills).
- **MCP tools** — `lawbook_init`, `lawbook_validate`, `lawbook_sync`, `lawbook_archive`, `lawbook_list`.
- **CLI** — `speclaw lawbook init | list | validate | sync | archive`.

The workspace is committed under `lawbook/`: `specs/` (canonical), `changes/`
(in-flight), `changes/archive/` (shipped), and `config.yaml` (the mandatory task
steps every change must include). The standards themselves are amended the same
way — through a spec change reviewed by a human.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Two ways to use it

speclaw meets you where you are. Everything works through the **CLI** — so no one
is blocked by MCP setup — and the same capabilities are exposed as **MCP tools**
for a smoother, integrated experience once configured. An agent without MCP can
still use Compass and the lawbook engine by calling the CLI from its shell.

<p align="center"><b>CLI</b> — the installer &amp; operator, runs anywhere <code>node</code> does</p>
<p align="center"><img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-cli.png" width="800" alt="speclaw CLI commands"></p>

<p align="center"><b>MCP</b> — the integrated agent surface, auto-registered by <code>init</code></p>
<p align="center"><img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-mcp.png" width="800" alt="speclaw MCP tools"></p>

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; What lands in your project

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-tree.png" width="800" alt="what speclaw writes into your project">
</p>

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Philosophy — why "laws"?

> [!NOTE]
> A guideline is a suggestion. A **law** is enforced. The most common failure mode
> of AI coding agents isn't lack of capability — it's working without the project's
> tacit knowledge: the rules the team actually lives by. speclaw makes that
> knowledge explicit, executable, and binding, and gives agents a local map
> (Compass) and a disciplined workflow (Lawbook) to act on it — without burning tokens.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Staying up to date

speclaw checks for new releases in the background (at most once a day) and nudges
you when one lands. To upgrade:

```bash
speclaw update
```

`update` upgrades the global package **and** brings the current project up to date
without a re-init, splitting files by who owns them:

- **Managed files** (speclaw's workflow machinery — the skills, commands, rules,
  and agent packs under `ai-specs/`) are **refreshed** to the new version, so
  improvements actually reach your project. If you edited one locally, `update`
  reports the overwrite so you can recover your copy from git; pass `--backup` to
  also keep a `<file>.bak`. Any `*.bak` is gitignored.
- **Personalized files** (your constitution and standards — `CLAUDE.md`,
  `AGENTS.md`, `LAWS.md`, `docs/standards/*`, `docs/compass.md`,
  `lawbook/config.yaml`) are **never auto-edited**. When a release changes their
  speclaw-authored content, `update` prints a prompt for **the agent you're
  using** to apply the change while preserving your project's specifics.

- `speclaw update --check` — report whether an update exists, change nothing.
- `NO_UPDATE_NOTIFIER=1` — silence the reminder.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Requirements

- **Node.js ≥ 22** — uses the built-in `node:sqlite`.
- **No native builds, no services, no API keys, no LLM download.** Tree-sitter
  parsers ship as WASM; the vector store is local.

<br/>

<div align="center">

**[MIT](LICENSE)** &nbsp;·&nbsp; built on ideas from
[OpenSpec](https://github.com/Fission-AI/openspec) &&nbsp;
[CodeGraph](https://github.com/colbymchenry/codegraph) &nbsp;·&nbsp;
see [ATTRIBUTION.md](ATTRIBUTION.md)

<i>speclaw · where specs become law</i>

</div>
