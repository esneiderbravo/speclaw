<div align="center">

<img src="brand/speclaw-banner.svg" width="820" alt="speclaw — where specs become law">

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
> **One command sets everything up.** Run `npx @esneiderbravo/speclaw init`, pick the agents you
> use, and speclaw scaffolds the project, indexes your code, and hands your agent
> a ready-to-paste prompt to finish the setup.

<br/>

## ◆ Quick start

<p align="center">
  <img src="brand/terminal-quickstart.svg" width="800" alt="npx @esneiderbravo/speclaw init">
</p>

<p align="center">Copy &amp; run in your project root: <code>npx @esneiderbravo/speclaw init</code></p>

`init` will:

1. **Ask which agents you use** (Claude Code, Cursor, Codex, …) — and configure
   only those. Add more later; nothing is forced on you.
2. Write the **foundation** (constitution + standards) and the **spec workflow**.
3. **Index your code** with a live progress bar and a summary of what it found.
4. Register the speclaw **MCP server** in each chosen agent's config.
5. Print a prompt to paste into your agent so it fills the constitution with your
   project's real architecture and conventions.

Works with `npm`, `pnpm` (`pnpm dlx @esneiderbravo/speclaw init`), and `yarn`.

<br/>

## ◆ It looks like this

<p align="center">
  <img src="brand/terminal-init.svg" width="800" alt="speclaw init — terminal output">
</p>

<p align="center"><i>Teal steps, green checks, a live progress bar — themed with the speclaw palette.</i></p>

<br/>

## ◆ The suite — four modules

| Module | What it does |
| :-- | :-- |
| **Foundation** | The project's constitution: `LAWS.md` binding a set of granular standards under `docs/standards/` (base, architecture, backend, frontend, testing, documentation, conventions, spec-workflow), plus strict `CLAUDE.md` / `AGENTS.md` agent contracts — filled from your real codebase. |
| **Compass** | speclaw's own local code graph. Parses your code (tree-sitter) into nodes + edges plus a local vector store, so an agent finds and understands code with a fraction of the tokens a grep/read loop would cost. No LLM, 100% local, lives in `.speclaw/` (gitignored). |
| **Spec** | speclaw's own spec-driven workflow: `draft → build → sync → archive` (and `explore`), backed by `spec_*` engine tools. No external CLI. |
| **Tools** | Opt-in packs of skills and subagents (currently the dev-agents) that agents use for specific tasks. |

Compass is inspired by [CodeGraph](https://github.com/colbymchenry/codegraph) and the Spec module by [OpenSpec](https://github.com/Fission-AI/openspec) — both MIT. speclaw reimplements the ideas as its own code and gives full credit; see [ATTRIBUTION.md](ATTRIBUTION.md).

<br/>

## ◆ Two ways to use it

speclaw meets you where you are. Everything works through the **CLI** — so no one
is blocked by MCP setup — and the same capabilities are exposed as **MCP tools**
for a smoother, integrated experience once configured. An agent without MCP can
still use Compass and the spec engine by calling the CLI from its shell.

<p align="center"><b>CLI</b> — the installer &amp; operator, runs anywhere <code>node</code> does</p>
<p align="center"><img src="brand/terminal-cli.svg" width="800" alt="speclaw CLI commands"></p>

<p align="center"><b>MCP</b> — the integrated agent surface, auto-registered by <code>init</code></p>
<p align="center"><img src="brand/terminal-mcp.svg" width="800" alt="speclaw MCP tools"></p>

<br/>

## ◆ What lands in your project

<p align="center">
  <img src="brand/terminal-tree.svg" width="800" alt="what speclaw writes into your project">
</p>

<br/>

## ◆ Philosophy — why "laws"?

> [!NOTE]
> A guideline is a suggestion. A **law** is enforced. The most common failure mode
> of AI coding agents isn't lack of capability — it's working without the project's
> tacit knowledge: the rules the team actually lives by. speclaw makes that
> knowledge explicit, executable, and binding, and gives agents a local map
> (Compass) and a disciplined workflow (Spec) to act on it — without burning tokens.

<br/>

## ◆ Requirements

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
