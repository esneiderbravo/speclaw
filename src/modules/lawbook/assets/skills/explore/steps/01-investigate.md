# Investigate

- **Refresh the index first.** Run `compass_index` before investigating — it is
  incremental (unchanged files skipped by hash), so it is cheap and keeps your
  reasoning on the current graph rather than a stale one.
- **Understand the code first.** Use `compass_recall` to find relevant code by
  meaning and `compass_explore` to read a symbol's source plus its callers and
  callees — before grep/read.
- **Ask sharp questions** to surface hidden assumptions, constraints, and edge
  cases. Confirm scope and non-goals.
- **Check the law.** Read the relevant `docs/standards/` so any direction you
  propose already fits the project's architecture and conventions.
- **Weigh approaches.** Lay out the viable options with trade-offs and give a
  recommendation, not an exhaustive survey.

Next: read `steps/02-summarize.md` and do only what it says.
