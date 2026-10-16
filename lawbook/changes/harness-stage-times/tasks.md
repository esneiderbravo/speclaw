# Tasks — harness-stage-times

## 0. Branch

- [x] 0.1 Create or check out the feature branch (`fix/harness-stage-times`)

## 1. Implementation

- [x] 1.1 `handleHarness` takes an optional `at` (defaults to now); not exposed through the MCP tool or the CLI
- [x] 1.2 Ship stamps each harness stage from its evidence (Compass call log since the branch's reflog creation, oldest branch commit or uncommitted change, level confirmation, the gate run), never earlier than the entry before it
- [x] 1.3 At level 1+ the stop records the work up to `implementing`, with no review verdict; a strict Compass gate leaves the harness to the agent

## 2. Verification

- [x] 2.1 Update the level 1+ ship test; add the stage-timing test (one clock for the whole test)
- [x] 2.2 Run the quality gates and verify they pass
- [x] 2.3 Write the discipline reports under reports/ (written by ship from the gates)
- [ ] 2.4 Archive the change within the same PR
