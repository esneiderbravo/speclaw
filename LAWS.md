# The Laws of speclaw

> This is the constitution of this project. It does not restate the standards —
> it **binds** them. Every AI agent working in this repository MUST read this
> file at the start of a session and MUST comply with every standard it links
> below. When a standard conflicts with an agent's default behavior, the
> standard wins.

- **Project**: speclaw — a self-contained MCP suite + CLI that turns any repo into a spec-driven, agent-ready project: its own constitution (Foundation), local code graph (Compass), and spec-driven workflow (Lawbook). 100% local — no LLM, no cloud, no API keys.
- **Organization**: Esneider Bravo · open source (MIT)
- **Stack**: TypeScript (ES2022, ESM, Node16 resolution) on Node.js ≥22 · MCP server (`@modelcontextprotocol/sdk`) + a Clack-based CLI · tree-sitter (WASM) parsing · `node:sqlite` code graph · Zod tool schemas. No frontend, no service, no LLM.

## The standards (each is a law)

| Law | File | Governs |
|-----|------|---------|
| Base | [`docs/standards/base-standards.md`](docs/standards/base-standards.md) | Languages, commits, comments, dependencies, engineering principles |
| Architecture | [`docs/standards/architecture.md`](docs/standards/architecture.md) | Modules/bounded contexts, layering, cross-boundary rules |
| Backend | [`docs/standards/backend-standards.md`](docs/standards/backend-standards.md) | Backend layers, docstrings, typing, tests, migrations |
| Frontend | [`docs/standards/frontend-standards.md`](docs/standards/frontend-standards.md) | Frontend layers, rendering boundaries, state, i18n, UI |
| Testing | [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md) | Quality gates, what must be tested, verification |
| Documentation | [`docs/standards/documentation.md`](docs/standards/documentation.md) | Docstring/API-comment convention per language |
| Conventions | [`docs/standards/conventions.md`](docs/standards/conventions.md) | Branches, PRs, tracker, versioning |
| Lawbook | [`docs/standards/lawbook.md`](docs/standards/lawbook.md) | Spec-driven workflow, mandatory task steps, archiving |
| Compass | [`docs/compass.md`](docs/compass.md) | Using the code knowledge graph first — before any grep/read |

## Binding rules

1. **Read the relevant standard before touching its area.** The table above is
   the map. Agents open the standard that governs the code they're changing.
2. **The standards are enforced, not advisory.** A violation is a blocking
   finding in review.
3. **Amendments go through the lawbook workflow.** A standard is changed like code — via a
   reviewed change at the appropriate ceremony level (see the lawbook law). An agent may
   propose an amendment; it may never silently ignore a standard.
4. **Entry points reference the law.** [`CLAUDE.md`](CLAUDE.md) and
   [`AGENTS.md`](AGENTS.md) point every agent here first.

## Project-specific laws

These bind in addition to the standards above — they encode speclaw's identity.

1. **Local-first is non-negotiable.** speclaw runs entirely on the user's
   machine: Node ≥22, no external service, no cloud API, no LLM download, no
   native build. Parsers ship as WASM (`tree-sitter-wasms`); storage is the
   built-in `node:sqlite`. Any dependency or feature that breaks "runs offline
   with no API keys" is rejected — justify every new dependency in the PR.
2. **Two transports, one implementation.** Every capability is implemented once
   in a `src/modules/*` module and exposed through **both** the CLI
   (`src/cli/commands/*`) and MCP (`src/modules/*/register.ts`). Never fork
   logic between the two surfaces; the command handler and the `register.ts`
   stay thin and delegate to the same code.
3. **speclaw scaffolds other repos — protect the templates.** The assets under
   `src/modules/*/assets/**` (foundation templates, lawbook skills/commands,
   tool packs) are product output. Changing them keeps the `{{placeholder}}`
   and `<!-- speclaw init: … -->` contracts intact, and the build
   (`scripts/copy-assets.mjs`) must copy any new asset into `dist/` — never
   hand-copy.
4. **`main` is protected.** Every change lands via a pull request approved by
   the maintainer ([@esneiderbravo](https://github.com/esneiderbravo), the sole
   `CODEOWNERS` entry). No direct pushes, force-pushes, or branch deletions to
   `main`.
5. **Keep attribution honest.** Compass reimplements ideas from CodeGraph and
   Lawbook from OpenSpec (both MIT). [`ATTRIBUTION.md`](ATTRIBUTION.md) must
   stay accurate as those modules evolve.

