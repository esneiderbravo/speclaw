# Frontend Standards — speclaw

A law of the project — see [`../../LAWS.md`](../../LAWS.md). Architecture and
layer boundaries: [`architecture.md`](architecture.md).

## Not applicable — speclaw has no web frontend

speclaw is a CLI + MCP server. There is **no browser UI, no framework, no i18n
layer, no design system** — so the web-frontend rules (rendering boundaries,
BFF, component state) do not apply. This file is intentionally a stub; if a web
UI is ever added, replace it via a spec change.

The two UI surfaces speclaw *does* have are governed elsewhere:

- **The terminal CLI** (`src/cli/`, rendered with `@clack/prompts` and
  `picocolors`) follows [`backend-standards.md`](backend-standards.md): command
  handlers and `src/cli/lib/ui.ts` stay thin and presentation-only, delegating
  to modules/shared. Keep colors on the speclaw palette (teal `#0E8E8E`).
- **The Compass visualizer** — an interactive HTML graph written to
  `.speclaw/graph.html` by `src/modules/compass/visualize.ts` — is generated
  output, not a maintained frontend app. It also follows the backend standard
  (TSDoc, strict `tsc`).
