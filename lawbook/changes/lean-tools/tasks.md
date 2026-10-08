# Tasks — lean-tools

## 0. Branch

- [x] 0.1 Create the branch `feat/lean-tools`

## 1. Implementation

- [x] 1.1 Remove the 20 retired MCP aliases, `lawbook_change` action `harness` and `speclaw lawbook harness`; keep `RETIRED_TOOLS` for doctor's stale-reference scan (now also `ai-specs/skills` and `ai-specs/agents`)
- [x] 1.2 Rewrite every generated text and doc that named a retired tool to its canonical call; add the 2.1.0 update prompt
- [x] 1.3 Scope the Cortex review: `cortex` `brief` at `reviewing` exports the diff and returns a bounded prompt; reviewer agent and dispatch step follow it, no model pinning
- [x] 1.4 Point a failing test run at `lawbook_investigate` (`PostToolUseFailure` + piped failures) and a test run at `compass_diff_context`, rate-limited, in-memory only
- [ ] 1.5 Benchmark scripts: full Cortex flow and fan-out vs one agent, in throwaway repos

## 2. Verification

- [x] 2.1 Update the affected tests; add `review-handoff`, `test-nudge`, retired-name and harness-rejection tests
- [x] 2.2 Verify live that Claude Code fires `PostToolUseFailure` for a failing Bash, with the output in `error`
- [ ] 2.3 Real agent runs (one-line, medium, large) speclaw vs agent alone → `reports/performance.md`
- [x] 2.4 Version 2.1.0 and CHANGELOG with the BREAKING note
- [ ] 2.5 Discipline reports under reports/ (written by ship from the gates)
- [ ] 2.6 Archive the change within the same PR
