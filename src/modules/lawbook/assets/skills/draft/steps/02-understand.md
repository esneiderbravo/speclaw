# Understand the request and the code

- When the handoff includes a complete explorer brief (symbols with files,
  callers and callees, blast radius, standards already read, recommended
  approach, open questions, and gaps), that brief is the code map. Call
  `compass_find` or `compass_explore` only for a gap the brief names. Re-read
  a file under `docs/standards/` only when the brief does not cite it.
- When the handoff has no complete explorer brief, refresh the index with
  `compass_index`, then use `compass_explore` and `compass_find` (mode:
  concept) before grep/read to locate the code and its blast radius. Read the
  governing standards in `docs/standards/`.
- Clarify what the user wants (feature / fix / refactor) and confirm scope.
- **Propose a ceremony level** with `lawbook_level` (mode `propose`) using the
  paths and symbols from the brief or from that locate pass; **confirm with the
  human** (mode `set`) before writing artifacts. For an obvious one-liner,
  offer `speclaw quick` instead.

Next: read `steps/03-name-capabilities.md` and do only what it says.
