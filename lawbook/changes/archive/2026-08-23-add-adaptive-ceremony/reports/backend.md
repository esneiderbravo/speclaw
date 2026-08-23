# Backend report — add-adaptive-ceremony

## Header

Adaptive ceremony levels 0–3: scoring, `change.json`, level-aware
validate/archive, `speclaw quick`, doctor distribution.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | pass |
| Build | `npm run build` | pass |
| Tests | `npm test` | pass (336/336) |

## Unit

- `test/unit/levels.test.ts` — score/level table (≥20 cases), downgrade reason,
  promote scaffolding
- `test/unit/engine.test.ts` — level-0 validate/archive without deltas; design
  required at level 3 for seeded changes

## Integration

- `test/integration/quick.test.ts` — `scaffoldQuick` creates record + change.json

## Manual

- `node dist/cli/index.js help` lists `quick`
- `node dist/cli/index.js quick … --json` emits structured JSON without branded header

## Verdict

pass
