# Investigate

- **Locate through Compass first.** Your first code-locating call is
  `compass_find` (mode: concept for an idea, exact for a name) or
  `compass_explore <symbol>` to read a symbol's source plus its callers and
  callees. Use `compass_diff_context` when the question is about a diff.
- **Index only when needed.** Run `compass_index` only when `compass_find`
  returns nothing or reports a missing or stale index, then retry the find. It
  is incremental (unchanged files skipped by hash).
- **Read/Grep code only with a named reason.** Before any Read/Grep/Glob of
  indexed source code, name which Rule 1 fallback holds: (1) a Compass call ran
  and returned nothing useful for the query, (2) the graph is missing and
  `compass_index` cannot build it, or (3) the target is not indexed code
  (markdown, JSON/config, stylesheets, logs, generated files, lockfiles).
  "I know which file it is" is not a reason — `compass_explore` takes a path.
- **Count your Compass calls.** Keep a tally of `compass_explore`,
  `compass_find`, and `compass_diff_context` calls for the brief.
- **Ask sharp questions** to surface hidden assumptions, constraints, and edge
  cases. Confirm scope and non-goals.
- **Check the law.** Read the relevant `docs/standards/` so any direction you
  propose already fits the project's architecture and conventions.
- **Weigh approaches.** Lay out the viable options with trade-offs and give a
  recommendation, not an exhaustive survey.

Next: read `steps/02-summarize.md` and do only what it says.
