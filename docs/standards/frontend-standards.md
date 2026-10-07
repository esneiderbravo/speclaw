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
  to modules/shared. Keep colors on the speclaw palette defined in
  `src/cli/lib/ui.ts` (signal `#00e3fd` on ink paper `#131313`, ≥4.5:1 WCAG
  contrast); retired palette colors must not return (guarded by tests).
  Machine-readable modes (`--json`, `--tap`) print no header or color.
- **The Compass visualizer** — an interactive HTML graph written to
  `.speclaw/graph.html` by `src/modules/compass/visualize.ts` — is generated
  output, not a maintained frontend app. It uses the same site palette and
  follows the backend standard (TSDoc, strict `tsc`).
- **Brand assets** (`brand/`, rendered by `npm run brand`) are generated from
  `scripts/render-brand.mjs`; edit the script, not the output.

- Lint / type-check command: `npm run check && npm run build`
