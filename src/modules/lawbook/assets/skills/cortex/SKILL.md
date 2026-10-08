---
name: cortex
description: Cortex — One brain. Many agents. The standard way to build any change, as fast as one agent: Compass + laws as guardrails, evidence shipped by hook, extra agents only in parallel.
---

# Cortex — One brain. Many agents.

One brain does the critical path; mechanical work costs no agent turns.

1. Branch `<type>/<slug>` (the slug is the change name).
2. Locate with `compass_find`, read with `compass_explore` (`include:
   ["source"]`), not cat/grep. No LAWS.md, config, or `--help`.
3. Public-API or multi-module work: `draft` skill first.
4. Implement the change and its test yourself; ask only when blocked.
5. Run the tests once; commit with a body that says why.
6. Stop. The `Stop` hook sizes the change from its diff and lists what its
   level owes in `lawbook/changes/<change>/` (why, checked tasks, delta spec,
   proposal, design). Write just that and stop again: gates run once, level 0
   archives. Never run ship or edit its report. Without hooks: `speclaw ship <change> --summary "<why>"`, last.

Never drive the harness by hand or post status updates. Review happens on the
PR and never blocks you.

Only when the work splits into three or more large, independent parts, read
`steps/01-load-or-start.md` (fan-out lane: parallel agents, never a chain).
