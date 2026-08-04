---
name: explore
description: Enter explore mode — a thinking partner for investigating an idea, a problem, or the codebase before or during a change. Use when the user wants to think something through, understand how something works, or clarify requirements before committing to a spec: "help me think through X", "how does X work", "explore X", "I'm not sure how to approach X". Part of speclaw's lawbook module.
---

# explore — Think it through

A low-commitment mode for investigating ideas and the codebase before (or
during) a change. Nothing is written to `lawbook/` here — the output is shared
understanding and a recommended direction.

## How to explore

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

## Output

A concise summary: the problem as understood, the constraints, the recommended
approach, and the open questions. When the direction is clear, offer to `draft`
the change.
