# API — add-bugfix-specs

**Change:** add-bugfix-specs · **Date:** 2026-08-23 · **Branch:** feat/bugfix-specs

## Surfaces

| Surface | Entry | Machine output |
| --- | --- | --- |
| MCP | `lawbook_investigate` | JSON via tool (MINIMAL_OMIT) |
| CLI | `speclaw lawbook draft --bug <name> [--json]` | JSON scaffold metadata |
| CLI | `speclaw lawbook investigate [--symptom \| --stack-trace] [--json]` | InvestigateResult JSON |

## Contract notes

- `lawbook_investigate`: requires `stackTrace` and/or `symptom`; returns `{ suspects, unresolvedFrames, degraded, guidance }`.
- `draft --bug`: creates `bugfix.md`, `change.json` with `changeType: "bug"`, no proposal/design.
- Branded header suppressed on `--json` for draft/investigate.

## Exercise

```bash
node dist/cli/index.js lawbook draft --bug demo --json
node dist/cli/index.js lawbook investigate --symptom "duplicate charge" --json
```

Both emitted JSON-only stdout (no header).

**Verdict:** API surfaces behave as specified.
