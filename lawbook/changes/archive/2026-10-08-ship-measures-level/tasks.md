# Tasks — ship-measures-level

## 0. Branch

- [x] 0.1 Create `fix/ship-measures-level`

## 1. Implementation

- [x] 1.1 Measure the branch diff in `shipChange`; record the level as `measured`
- [x] 1.2 Ignore version-only bumps of `package.json` / `package-lock.json`
- [x] 1.3 Raise a measured level when the diff grows; reopen an outgrown level-0 archive not present at the merge base
- [x] 1.4 `pendingArtifacts`: list what the level owes before any gate runs; the hook exits 2 with it once
- [x] 1.5 Level 0 never waits: record from commit bodies, else the file list
- [x] 1.6 Count a hotspot only with 3+ commits in the window
- [x] 1.7 Calibrate cuts to `[5, 16, 25]` and the public-API weight to 5 against the last twelve PRs
- [x] 1.8 Update the Cortex skill (within the token budget), CLAUDE/AGENTS templates, docs

## 1b. Tools agents actually use

- [x] 1b.1 Nudge on Bash reads of indexed code; pass `tool_input.command` to the hook
- [x] 1b.2 Keep `speclaw_check` and `lawbook_investigate` in the minimal profile
- [x] 1b.3 MCP server instructions; `alwaysLoad` for find/explore/diff_context/investigate; when-to-use descriptions
- [x] 1b.4 `compass_explore` callee chain (and `to` path) with sources
- [x] 1b.5 `lawbook_investigate` ranks test-reachable code, drops test and runtime frames, 5 suspects
- [x] 1b.6 Resolve trace paths under a symlinked root
- [x] 1b.8 Silence the nudge under 40 indexed files; record index totals for hooks; one `git status` fast path for the doc hint
- [x] 1b.7 Name what the level owes while the agent edits (`PostToolUse` doc hint), so documentation lands in the same turn

## 1c. Cortex review rework (iteration 1)

- [x] 1c.1 B1: promoted proposals and the level-0 file-list record count as owed
- [x] 1c.2 B2: the doc-hint MCP test runs on its own git fixture, never the checkout
- [x] 1c.3 B3: task stubs match whole generated lines only
- [x] 1c.4 B4: `reports/backend.md` (scenario coverage, red-first runs), `api.md`, `performance.md`
- [x] 1c.5 N2 POSIX object path in `git cat-file`; N3 literal commit bodies, 15-line cap; N6 piped output filters and `sed -i` are not reads

## 2. Verification

- [x] 2.1 Integration tests for measured levels, pending artifacts, version bumps, commit-body why, reopen, merged archives
- [x] 2.2 Regression tests failing before the fix: young-repo hotspot; explore chain, investigate reachability, symlinked trace paths
- [x] 2.3 Fix the benchmark fixture (Stop hook, bash 3.2) and run main vs branch
- [x] 2.4 Run the quality gates
- [x] 2.5 Bump to 2.0.20 with a CHANGELOG entry
