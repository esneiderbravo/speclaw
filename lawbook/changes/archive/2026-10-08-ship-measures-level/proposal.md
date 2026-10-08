# ship-measures-level

## Why

The `Stop` hook created every change with no targets, so the ceremony level was
never measured: every change, multi-module fixes included, was archived at
level 0 with no tasks, delta specs, proposal or design, and a record that only
listed file names while claiming "confirmed by: human". Cortex gained speed and
silently dropped the documentation that is the point of a spec-driven workflow.

## What changes

- `speclaw ship` (and the `Stop` hook) measures the branch diff and records the
  level as `measured`; a version-only bump of `package.json` does not count.
- A measured level rises when the diff grows, reopening a level-0 archive the
  branch outgrew; an archive already merged into the base is never reopened.
- Before any gate runs, ship lists what the level owes (tasks, delta spec,
  proposal, design, the record's why at level 1) and the hook hands it to the
  agent; the gates still run once. Level 0 never waits: its record takes the
  branch's commit bodies, else the file list.
- A file counts as a hotspot only with 3+ commits in the window.
- Ceremony cuts default to `[5, 16, 25]` and a public-API change weighs 5,
  calibrated on this repo's last twelve PRs.
- The Cortex skill, CLAUDE/AGENTS templates and docs describe the flow; the
  benchmark script installs the `Stop` hook and gains per-level scenarios.
- Agents use the speclaw tools: measured runs showed them reading code with
  `cat`/`sed`, never calling `lawbook_investigate`, and `minimal` projects
  answering every hook with "Tool not found". The server now sends MCP
  instructions, loads the code-reading tools up front, keeps `speclaw_check`
  and `lawbook_investigate` in minimal, nudges on shell reads, returns whole
  call chains from `compass_explore`, and ranks only test-reachable code in
  `lawbook_investigate`.

## Impact

- Modules: `lawbook` (ship, levels, scaffold, quick, engine), `cli` (ship,
  ship-on-stop, update), `foundation` (hooks doc, doctor, templates), docs.
- Agents spend one extra turn on level 1+ work (measured +15 s on a two-module
  fix); level 0 costs nothing extra.
- Projects with explicit `cuts` in `lawbook/config.yaml` keep their values.
