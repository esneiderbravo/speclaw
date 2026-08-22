# Understand the request and the code

- **Refresh the index first.** Run `compass_index` before reasoning about the
  code — it is incremental (unchanged files are skipped by hash), so this is
  cheap and guarantees your decisions rest on the current graph, not a stale one.
- Clarify what the user wants (feature / fix / refactor) and confirm scope.
- Use `compass_explore` and `compass_recall` (speclaw's code index) BEFORE
  grep/read to locate the real code the change touches and its blast radius.
- Read the governing standards in `docs/standards/` (architecture, backend,
  frontend, testing) so the change complies with the project's law.

Next: read `steps/03-name-capabilities.md` and do only what it says.
