---
name: cortex
description: Cortex — One brain. Many agents. The standard way to build any change, as fast as one agent: Compass + laws as guardrails, evidence shipped by hook, extra agents only in parallel.
---

# Cortex — One brain. Many agents.

One brain does the critical path; mechanical work costs no agent turns.

1. Branch `<type>/<slug>` (the slug is the change name).
2. Locate with Compass (`compass_find` / `compass_explore`). Do not read
   LAWS.md, config, standards, or `--help` to learn the process — this is it.
3. Implement the change and its test yourself; ask the human only when blocked.
4. Run the tests once.
5. Stop. In Claude Code the `Stop` hook (`speclaw ship-on-stop`) records the
   change, runs the gates once, writes the report from real output, and
   archives level-0 work; a failing gate comes back to you. Do not run ship,
   check the hook, or edit its output. Agents without hooks run `speclaw ship
   <change> --summary "<what and why>"` once, last.

Never drive the harness by hand, write proposal/design/reports for small work,
or post status updates. Review happens on the PR and never blocks you.

Only when the work splits into three or more large, independent parts, read
`steps/01-load-or-start.md` (fan-out lane: parallel agents, never a chain).
