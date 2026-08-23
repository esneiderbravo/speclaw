# API checks — add-hotspots-coupling (2026-08-22)

Date · Branch `feat/hotspots-coupling` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Contract registration | `npm test` (`registers.test.ts`) | ✅ tools include `compass_hotspots`, `compass_coupling` |
| CLI help | `node dist/cli/index.js help` | ✅ lists `hotspots` and `coupling` |
| CLI JSON contract | `node dist/cli/index.js hotspots --json` / `coupling … --json` | ✅ parses; no branded tagline |
| Full suite | `npm test` | ✅ 328 pass / 0 fail |

## Surface contracts

### MCP `compass_hotspots`

- **Inputs:** `projectPath`, optional `days` / `since` / `sortBy` / `limit`
- **Output:** `{ window, sortBy, hotspots[{ file, activity, health\|null, combinedScore }], diagnostics, warnings }`
- **Exposure:** in `MINIMAL_OMIT`
- **Description:** ≤25 words; no case-study “proof” claims

### MCP `compass_coupling`

- **Inputs:** `projectPath`, `file`, optional window / `minShared` / `maxFilesPerCommit` / `limit`
- **Output:** `{ file, window, partners[{ both, strength, inGraph, isTestPair, … }], diagnostics, warnings }`
- **Exposure:** in `MINIMAL_OMIT`

### CLI

- `speclaw hotspots` (`--json`, `--days`, `--since`, `--sort`, `--limit`) — no branded header
- `speclaw coupling <file>` (`--json`, thresholds) — no branded header

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| `help` lists hotspots and coupling | dogfood `help` |
| Hotspots stdout no header | integration CLI JSON + forced NO_COLOR |
| Coupling JSON parses without header | integration CLI |
| Query-family header suppression | dispatch not in `HEADER_COMMANDS` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

API surface matches the delta; ready to sync and archive.
