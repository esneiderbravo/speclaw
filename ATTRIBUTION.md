# Attribution

speclaw is a self-contained suite. It does **not** bundle, fork, or depend on
OpenSpec or CodeGraph at runtime — its spec workflow (the **spec** module) and
its code graph (the **Compass** module) are original implementations written
from scratch. But the ideas came from two excellent open-source projects, and
they deserve the credit. Please star and support the originals:

## OpenSpec — inspiration for the spec module

- **Repo**: https://github.com/Fission-AI/openspec
- **License**: MIT — Copyright (c) Fission AI
- **What we took**: the *idea* of spec-driven development for AI agents —
  proposals, delta specs, a `changes/` workflow, and archiving. speclaw's spec
  module (`draft → build → sync → archive → explore`, the `spec_*` tools, and
  the `spec/` layout) is our own implementation of that idea, deliberately
  simpler, with no external CLI. No OpenSpec code is included.

## CodeGraph — inspiration for the Compass module

- **Repo**: https://github.com/colbymchenry/codegraph
- **License**: MIT — Copyright (c) Colby McHenry
- **What we took**: the *idea* of a local, pre-indexed code knowledge graph
  that saves an agent the tokens of grep/read loops, with semantic search over
  nodes. speclaw's Compass module (tree-sitter parsing, a `node:sqlite` graph
  of nodes/edges, a local vector store, and the `compass_*` tools) is our own
  implementation. No CodeGraph code is included.

## Everything else

The foundation (the LAWS constitution and the granular `docs/standards/`), the
`ai-specs/` multi-IDE distribution standard, the skill/agent packs, and the MCP
server are original work by Esneider Bravo, distilled from real production
projects, and released under the MIT license of this repository.
