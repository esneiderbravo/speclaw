# Implement task by task

- Use `compass_explore` before editing to see a symbol's callers/callees and
  blast radius; re-run `compass_index` after significant edits to keep the
  graph fresh.
- Make the smallest correct change; match the surrounding code.
- The code must satisfy the delta spec exactly. If reality diverges from the
  spec, update the spec in the change (not silently) — the two must agree.
- Check off each task in `tasks.md` as you complete it.

Next: read `steps/04-quality-gates.md` and do only what it says.
