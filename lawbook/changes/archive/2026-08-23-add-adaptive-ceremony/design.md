# Design — adaptive-ceremony

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Signals + score + matrix | `lawbook/levels.ts` (new) | Pure, deterministic, unit-testable |
| Persist confirmation | `change.json` under the change dir | Machine state; no new YAML parser |
| Gates | `engine.ts` `specValidate` / `specArchivePreconditions` | Single enforcement point for CLI + MCP |
| Propose UX | `lawbook_level` + draft skill + Clack | Human confirms; agent cannot silently downgrade |
| Escape hatch | `speclaw quick` | Level-0 scaffold in seconds |
| Signals sources | Existing Compass (`impact`, `affectedTests`, `hotspots`) + `changedFiles` | Deps already shipped; no schema bump |
| Anti-abuse | `doctor` level histogram + validate when measured ≫ recorded | Visible, not preachy |

**Invariant:** level changes **how much prose** you write, never whether
evidence (`reports/`) and checked work exist.

## Level → artifacts (normative)

| Level | record | proposal | design | tasks | delta specs | reports |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | required | — | — | checklist in record | — | required |
| 1 | required | — | — | required | ≥1 requirement | required |
| 2 | — | required | optional† | required | required | required |
| 3 / missing `change.json` | — | required | required | required | required | required |

† If design omitted at level 2, `record.md` MUST state why.

Archive sync gate applies only when the level requires delta specs. Coverage
archive gate remains opt-in by requirement ids (level 0 typically has none).

## Scoring (defaults)

Reusable from the roadmap: bucketed points for files/modules/affectedTests/
blastRadius; bonuses for public API, global file, hotspot floor; cuts
`[3, 8, 15]`. `onlyDocs` (except `lawbook/specs/**`) short-circuits to 0.
Missing index ⇒ **no proposed level** (`degraded: no-index`) — ask the human;
never invent "must be small".

Hotspot signal: normalize using existing `hotspots` output (e.g. whether any
touched file appears in the top combined band / above a configurable floor) —
document the exact rule in code comments + spec; no new magic composite.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| Binary quick vs full only | Loses BMAD-style middle; explore chose full 0–3 |
| Auto-apply proposed level | User learns the tool lies when wrong |
| New Compass schema for ceremony | Unnecessary; signals already available |
| Guess level from ticket text (LLM) | Commodity; speclaw's edge is measurement |

## Trade-offs

- **+1 MCP tool** vs tool-surface — mitigated by `MINIMAL_OMIT`.
- **Overcount from name-homonym impact** — safe bias (more ceremony).
- **Business-critical one-liners** — human override + configurable global globs.
- **Scope-growth validate** — friction by design when level 0 outgrows itself.

## File plan

```
src/modules/lawbook/levels.ts          NEW
src/modules/lawbook/engine.ts          level-aware validate/archive; scaffold change.json
src/modules/lawbook/register.ts        +lawbook_level
src/shared/exposure.ts                 MINIMAL_OMIT
src/cli/commands/quick.ts              NEW
src/cli/commands/lawbook.ts / index    level list column; draft prompt
lawbook/config.yaml (+ template)       ceremony: thresholds / globs
ai-specs skills/commands               draft + quick + archive wording
LAWS.md, docs/standards/lawbook.md     level-based ceremony
src/modules/foundation doctor          level distribution check
test/unit/levels.test.ts               NEW
test/unit/lawbook-engine…              matrix × level
test/integration/quick.test.ts         NEW
```
