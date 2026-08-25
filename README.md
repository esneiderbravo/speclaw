<div align="center">

<img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/speclaw-banner.png" width="820" alt="speclaw — where specs become law">

<br/>

<a href="https://www.npmjs.com/package/@esneiderbravo/speclaw"><img src="https://img.shields.io/npm/v/@esneiderbravo/speclaw?color=0E8E8E&labelColor=0B0F10&style=flat-square&label=npm" alt="npm"></a>
&nbsp;<a href="https://github.com/esneiderbravo/speclaw/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/esneiderbravo/speclaw/ci.yml?branch=main&label=CI&labelColor=0B0F10&style=flat-square&color=0E8E8E" alt="CI"></a>
&nbsp;<a href="https://www.npmjs.com/package/@esneiderbravo/speclaw?activeTab=versions"><img src="https://img.shields.io/badge/provenance-SLSA-0E8E8E?labelColor=0B0F10&style=flat-square" alt="npm provenance"></a>
&nbsp;<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0E8E8E?labelColor=0B0F10&style=flat-square" alt="MIT"></a>
&nbsp;<img src="https://img.shields.io/badge/node-%E2%89%A522.16-0E8E8E?labelColor=0B0F10&style=flat-square" alt="Node >= 22.16">
&nbsp;<img src="https://img.shields.io/badge/v1.0-0E8E8E?labelColor=0B0F10&style=flat-square" alt="v1.0">

<br/><br/>

<p align="center">
<b>AI agents are brilliant and blind</b> — brilliant at writing code, blind to <i>your</i>
project's rules. <b>speclaw 1.0</b> hands them what they're missing: the codebase's
<b>written laws</b> (a constitution built from your real code), a <b>local map</b> to
navigate it without burning tokens, a <b>disciplined workflow</b> for every change,
and the <b>gates</b> that make those laws hold in the editor, in CI, and in the PR.
<br/>
One command. No cloud, no LLM, no API keys — <b>everything runs on your machine.</b>
</p>

<img src="https://img.shields.io/badge/100%25_local-0E8E8E?labelColor=0B0F10&style=flat-square" alt="100% local">
&nbsp;<img src="https://img.shields.io/badge/no_LLM_·_no_cloud-0E8E8E?labelColor=0B0F10&style=flat-square" alt="no LLM">
&nbsp;<img src="https://img.shields.io/badge/CLI_+_MCP-0E8E8E?labelColor=0B0F10&style=flat-square" alt="CLI + MCP">
&nbsp;<img src="https://img.shields.io/badge/8_canonical_tools-0E8E8E?labelColor=0B0F10&style=flat-square" alt="8 tools">
&nbsp;<img src="https://img.shields.io/badge/any_agent-0E8E8E?labelColor=0B0F10&style=flat-square" alt="any agent">

</div>

<br/>

> [!TIP]
> **One command. Detects your agents and wires only those.** Paste
> `npx @esneiderbravo/speclaw@latest init` — speclaw detects Claude Code, Cursor,
> Codex, Windsurf, and generic `AGENTS.md` surfaces, scaffolds the constitution +
> lawbook, indexes your code, and registers the local MCP server — only for the
> agents you pick. This one-liner is a **stable contract** (see
> [CONTRIBUTING.md](CONTRIBUTING.md)); do not invent alternate install commands in
> directories or newsletters.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Quick start

```bash
npx @esneiderbravo/speclaw@latest init
```

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-quickstart.png" width="800" alt="speclaw init">
</p>

Prefer a global install for repeated CLI use?

```bash
npm i -g @esneiderbravo/speclaw
speclaw init
```

The `speclaw` command is then available everywhere — run `speclaw index`,
`speclaw doctor`, `speclaw verify`, `speclaw owners --write`, or
`speclaw lawbook …` directly.

`init` will:

1. **Ask which agents you use** (Claude Code, Cursor, Codex, Windsurf, …) — and
   configure only those. Add more later; nothing is forced on you.
2. Write the **foundation** (constitution + standards) and the **lawbook workflow**,
   compile your blocking laws into **agent hooks**, and create a committed
   **`speclaw.lock`** baseline for rule-file integrity.
3. **Index your code** with a live progress bar and a summary of what it found.
4. Register the speclaw **MCP server** in each chosen agent's config
   (eight canonical tools; use `--minimal` to omit setup/lifecycle tools).
5. Print a prompt to paste into your agent so it fills the constitution with your
   project's real architecture and conventions.

When something breaks, run `speclaw doctor --json` and paste it into an issue
(required on bug reports). Output is redacted by default.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Verify a release (provenance)

Every npm publish is signed via **Trusted Publishing (OIDC)** and carries a
SLSA provenance attestation tied to this repository and workflow. That proves
*where* the tarball was built — not that its contents are benign. Pair it with
your own review and with **`speclaw.lock`** digests on rule files (see
[Verify in CI](#-verify-in-ci)).

```bash
npm audit signatures
# After downloading the tarball from the registry:
gh attestation verify <tarball> --owner esneiderbravo
```

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; It looks like this

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-init.png" width="800" alt="speclaw init — terminal output">
</p>

<p align="center"><i>Teal steps, green checks, a live progress bar — themed with the speclaw palette.</i></p>

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; The suite — five modules

| Module | What it does |
| :-- | :-- |
| **Foundation** | The project's constitution: `LAWS.md` binding granular standards under `docs/standards/`, plus `CLAUDE.md` / `AGENTS.md`. **Enforced** via agent hooks (`speclaw check`), deterministic graph laws (`speclaw verify` / `laws verify`), multidialect compile (`laws compile`), and committed **`speclaw.lock`** digests + injection scan (`laws lock` / `accept` / `scan`). |
| **Compass** | Local code graph (tree-sitter → `node:sqlite`): hybrid find (FTS5 + vectors + RRF + PageRank), impact, affected-tests, hotspots, coupling, visualize. Schema **10**. No LLM — lives in `.speclaw/` (gitignored). |
| **Lawbook** | Spec-driven workflow with **adaptive ceremony** (levels 0–3), bugfix changes + `lawbook_investigate`, EARS linting, requirement **coverage**, and sealed **drift** anchors. Loop: `explore → draft → build → sync → archive`. |
| **Team** | Declare `team.owners` in `lawbook/config.yaml`; `speclaw owners --write` compiles a managed trailing block in `.github/CODEOWNERS` (GitHub: last match wins). Doctor checks the posture. CLI-only — no MCP tool. |
| **Tools** | Opt-in packs of skills and subagents (currently the dev-agents). |

Compass is inspired by [CodeGraph](https://github.com/colbymchenry/codegraph) and the Lawbook module by [OpenSpec](https://github.com/Fission-AI/openspec) — both MIT. speclaw reimplements the ideas as its own code and gives full credit; see [ATTRIBUTION.md](ATTRIBUTION.md).

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Context cost

speclaw publishes and **gates** its own always-on context cost. Measured with a
deterministic offline estimator (`speclaw/estimate-v1`, about ±8% vs Anthropic's
tokenizer on this corpus — not a BPE dependency):

| | Tokens |
| :-- | --: |
| **speclaw budget (always-on)** | **~13.7k** (8 MCP tools · ceiling **14.0k**) |
| Spec Kit commands alone | ~18.6k ([spec-kit#1401](https://github.com/github/spec-kit/issues/1401)) |

```bash
speclaw budget          # human table
speclaw budget --json   # machine-readable; used by the suite gate
speclaw coverage        # requirement → impl → test coverage (TAP / table)
speclaw drift           # sealed spec ↔ code drift (default --fail-on semantic)
speclaw owners --write  # team.owners → .github/CODEOWNERS
speclaw init --minimal  # omit setup/lifecycle MCP tools from registration
```

Raising a number in committed `token-budget.json` is a reviewable PR. Optional
calibration (never CI): `npm run budget:calibrate` with `ANTHROPIC_API_KEY`.
MCP servers cannot mark tools `defer_loading` — savings come from shorter
definitions, omitted registration (`--minimal`), and JIT skill steps.

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
| **draft** | Propose a **ceremony level** (0–3) from graph signals, confirm it, then scaffold only what that level needs under `lawbook/changes/<name>/`. |
| **build** | Implement the tasks in order, keeping code and spec in agreement, and record test results under `reports/`. |
| **sync** | Reconcile the delta specs against what was actually built, then promote them into the canonical `lawbook/specs/`. |
| **archive** | Reconcile, then validate, promote, and move the change to `lawbook/changes/archive/` — **in the same PR**. Gated on tasks, reports, synced specs, and coverage. |

**Ceremony levels** (confirmed in `change.json`; missing ⇒ level 3):

| Level | When | Artifacts |
| :-- | :-- | :-- |
| **0** | One-liner / typo / docs-only | `speclaw quick` → `record.md` + `reports/` |
| **1** | Small fix with a delta | `record.md` + `tasks.md` + ≥1 delta + `reports/` |
| **2** | Normal feature | `proposal.md` + tasks + deltas + `reports/` (`design.md` optional) |
| **3** | Full ceremony | proposal + design + tasks + deltas + `reports/` |
| **bug** | Regression / RCA | `speclaw lawbook draft --bug` → `bugfix.md` + investigate first |

Plus a **`reports/`** folder — scaffolded at draft, filled at build with one report
per discipline (`backend.md`, `frontend.md`, `api.md`, …). `lawbook_archive`
refuses to archive without it.

> [!NOTE]
> **Delta specs are normative and testable.** Requirements use `SHALL`/`MUST`
> under `### Requirement:` headers (EARS-friendly), each with `#### Scenario:`
> blocks. `lawbook_validate` checks structure; `speclaw coverage` tracks
> `req~…~N` → impl/test via `// Covers:` comments.

**Three ways to drive it — same engine, no external CLI:**

- **In your agent** — `/lawbook:explore`, `/lawbook:draft`, `/lawbook:build`, `/lawbook:sync`, `/lawbook:archive` (and `/lawbook:quick`, investigate).
- **MCP tools** — eight canonical: `compass_explore`, `compass_find`, `compass_diff_context`, `compass_index`, `lawbook_change`, `lawbook_investigate`, `speclaw_setup`, `speclaw_check`.
- **CLI** — `speclaw lawbook …`, `speclaw quick`, `speclaw coverage`, `speclaw drift`.

The workspace is committed under `lawbook/`: `specs/`, `changes/`,
`changes/archive/`, `anchors/` (drift photographs), and `config.yaml`
(mandatory tasks, ceremony cuts, `team.owners`, EARS knobs).

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Two ways to use it

speclaw meets you where you are. Everything works through the **CLI** — so no one
is blocked by MCP setup — and the same capabilities are exposed as **MCP tools**
for a smoother, integrated experience once configured. An agent without MCP can
still use Compass and the lawbook engine by calling the CLI from its shell.

<p align="center"><b>CLI</b> — the installer &amp; operator, runs anywhere <code>node</code> does</p>
<p align="center"><img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-cli.png" width="800" alt="speclaw CLI commands"></p>

<p align="center"><b>MCP</b> — eight canonical tools, auto-registered by <code>init</code></p>
<p align="center"><img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-mcp.png" width="800" alt="speclaw MCP tools"></p>

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; What lands in your project

<p align="center">
  <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/terminal-tree.png" width="800" alt="what speclaw writes into your project">
</p>

**Committed vs. local.** Your **personalized source** is committed — `LAWS.md`,
`CLAUDE.md`, `AGENTS.md`, `docs/standards/*`, `docs/compass.md`, the `lawbook/`
workspace, and **`speclaw.lock`** (rule digests at the repo root). speclaw's
**regenerable workflow content is local, not committed**: only `ai-specs/`
(skills, commands, rules, agent packs, and its `.speclaw.json` manifest) is
gitignored, because `init`/`update` reconstruct it from the package. So **after
cloning a speclaw project, run `speclaw init` (or `speclaw update`)** to
regenerate `ai-specs/` locally. Optional **`team.owners`** in
`lawbook/config.yaml` compiles into a managed block at the end of
`.github/CODEOWNERS` via `speclaw owners --write`.

**Enforcement artifacts.** For agents that support hooks, speclaw merges its law
hooks into that agent's settings **by identity** — it never touches hooks you
added yourself. The compiled law manifest lives in `.speclaw/laws-manifest.json`
(gitignored), and a context-coverage log feeds `speclaw doctor`.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Philosophy — why "laws"?

> [!NOTE]
> A guideline is a suggestion. A **law** is enforced. The most common failure mode
> of AI coding agents isn't lack of capability — it's working without the project's
> tacit knowledge: the rules the team actually lives by. speclaw makes that
> knowledge explicit, executable, and binding, and gives agents a local map
> (Compass) and a disciplined workflow (Lawbook) to act on it — without burning tokens.

This is why "enforced" is literal, not a metaphor. Anthropic's own guidance puts
it plainly:

> _"An instruction like 'never edit .env' in CLAUDE.md or a skill is **a request,
> not a guarantee**. A `PreToolUse` hook that blocks the edit is enforcement. If a
> rule must hold every time, make it a hook rather than a prompt instruction."_
> — [Claude Code — Hooks](https://code.claude.com/docs/en/hooks)

So `speclaw init` compiles your blocking laws into agent hooks: a law marked
`bloqueo` is denied at the keystroke (`PreToolUse`), citing the law's id, text,
and source. `speclaw check --dry-run --path <file>` previews what would block, and
`speclaw doctor` reports how many of your laws actually reached the agent's
context. Agents without hooks (Cursor, Codex) enforce the same laws in CI via
`speclaw verify`. Digests in `speclaw.lock` catch silent edits to the rule files
themselves (the *Rules File Backdoor*).

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Verify in CI

`speclaw verify` evaluates your `deps` and `graph` laws against the local Compass
index, and — when `speclaw.lock` is present — compares digests of managed rule
files and scans them (plus skill packs) for known injection patterns. It is
deterministic: **no model, no API key, no network.**

```bash
speclaw verify --ci --sarif speclaw.sarif --json speclaw.json
```

Create or refresh the committed lockfile (repo root, never under `.speclaw/`):

```bash
speclaw laws lock
speclaw laws scan
speclaw laws accept AGENTS.md   # interactive TTY only — never via MCP
```

| Exit | Meaning |
| :-- | :-- |
| **0** | No findings at or above `--fail-on` (default `error`) |
| **1** | At least one finding at or above `--fail-on` (including strict integrity / scan errors) |
| **2** | Usage error (unknown `--fail-on` / `--format`) |
| **3** | Environment (shallow clone under `--ci`, or an unwritable `--sarif`/`--json` path) |
| **4** | At least one law was skipped, and `--strict-engines` was set |

**Limits (honest):** digests catch any edit; the scanner catches known payload
shapes after Unicode normalization — not LLM-grade semantic injection. Digest
acceptance is a human gate (`laws accept` on a TTY). There is no Sigstore signing
of the lock in this release. Regenerable IDE mirrors (e.g. `.cursor/rules` →
`ai-specs/`) are not pinned as strict committed files.

On GitHub:

```yaml
- uses: esneiderbravo/speclaw@v1
```

`init` / `update` write `.github/workflows/speclaw.yml` only when that path is
missing — they never overwrite your CI. Make the check required in branch
protection yourself; speclaw does not. Pair with `speclaw owners` + *Require
review from Code Owners* when you declare `team.owners`.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Staying up to date

speclaw checks for new releases in the background (at most once a day) and nudges
you when one lands. To upgrade:

```bash
speclaw update
```

`update` upgrades the global package **and** brings the current project up to date
without a re-init, splitting files by who owns them:

- **Managed files** (skills/commands/rules under `ai-specs/`) are **refreshed**.
  Pass `--backup` to keep a `<file>.bak` before overwrite.
- **Personalized files** (`CLAUDE.md`, `AGENTS.md`, `LAWS.md`, `docs/standards/*`,
  `docs/compass.md`, `lawbook/config.yaml`) are **never auto-edited** — `update`
  prints a prompt for the agent you're using.
- **`speclaw.lock`** and the CODEOWNERS owners block are refreshed when configured.

- `speclaw update --check` — report whether an update exists, change nothing.
- `NO_UPDATE_NOTIFIER=1` — silence the reminder.

<br/>

## <img src="https://raw.githubusercontent.com/esneiderbravo/speclaw/main/brand/diamond.png" height="20" alt="◆" align="absmiddle">&nbsp; Requirements

- **Node.js ≥ 22.16** — uses built-in `node:sqlite` (FTS5 for hybrid find).
- **No native builds, no services, no API keys, no LLM download.** Tree-sitter
  parsers ship as WASM; the vector store is local.

<br/>

<div align="center">

**[MIT](LICENSE)** &nbsp;·&nbsp; built on ideas from
[OpenSpec](https://github.com/Fission-AI/openspec) &&nbsp;
[CodeGraph](https://github.com/colbymchenry/codegraph) &nbsp;·&nbsp;
see [ATTRIBUTION.md](ATTRIBUTION.md)

<i>speclaw 1.0 · where specs become law</i>

</div>
