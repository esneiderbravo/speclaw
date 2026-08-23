# Design — add-bugfix-specs

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Bug scaffold + section validation | `lawbook/bugfix.ts` (new) | Pure templates + markdown section gates |
| Stack parse | `lawbook/stack-parse.ts` (new) | Testable fixtures; V8 + Python only |
| Forensic ranking | `lawbook/investigate.ts` (new) | Composes Compass + git-history; no LLM |
| Type + artifact matrix | `lawbook/levels.ts` | Extend `CeremonyRecord`, `artifactNeeds(level, changeType)` |
| Gates | `engine.ts` | Branch `changeType === "bug"` in validate/archive |
| Surfaces | `register.ts`, `cli/commands/lawbook.ts` | MCP + CLI |
| Agent assets | `assets/commands|skills/investigate`, draft updates | RCA script distinct from explore |

**Invariant:** bug changes trade shorter prose for **harder evidence** — repro,
regression, prevention — never weaker archive gates than features at the same
level.

## Bug artifact matrix (normative)

| Level | bugfix.md | proposal | design | tasks | delta specs | reports |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | required† | — | — | checklist in bugfix or inline | — | required |
| 1 | required | — | — | required | optional‡ | required |
| 2–3 | required | — | required | required | optional‡ | required |

† Level 0: sections 1, 2, 3, 5, 6 required; 4 and 7 may be `n/a:` with reason.
‡ Delta required when prevention concludes a canonical requirement was missing.

Feature matrix unchanged; `changeType` defaults to `"feature"`.

## `change.json` extension

```json
{
  "confirmedLevel": 1,
  "changeType": "bug",
  "resolution": "fixed",
  "actor": "…",
  "confirmedAt": "…"
}
```

`resolution` set on archive: `fixed` | `mitigated` | `not-a-bug`. Omitted until
archive.

## Investigate pipeline

```
input: stackTrace | symptom (+ optional hintPaths)
  → parseStackTrace (V8/Python; external → unresolvedFrames)
  → normalize paths (dist/ → src/ by basename; never silent guess)
  → for each own frame: explore by file:line first, then name (homonym-safe)
  → graph neighbours (callers/callees distance 1)
  → if no trace: recall(symptom, 15)
  → hotspots + coupling on candidate files
  → affected_tests per top candidates
  → lastTouch (git-history) as recently-changed signal
  → score() fixed weights → sort → cap maxSuspects
  → scan archived bugfix.md for matching root-cause symbols
output: InvestigateResult { suspects[], unresolvedFrames[], degraded[], guidance }
```

### Fixed score weights (v1)

| Reason | Weight |
| --- | ---: |
| stack-frame | 40 |
| frame-caller | 25 |
| frame-callee | 15 |
| hotspot | 20 |
| temporal-coupling | 15 |
| semantic-match | 10 |
| hint-path | 8 |
| recently-changed | 10 |

Divide score by `log2(callerCount + 2)` for generic utilities. Minimum 3
suspects when data allows.

Degrade independently: `no-index`, `no-hotspots`, `no-coupling`,
`no-embeddings`, `no-git` — never invent graph suspects without index verification.

## Pre-seed from investigate

When `draft --bug` follows investigate (optional `--from-investigate` JSON path
or inline MCP handoff):

- **§1 Observed symptom** — quoted input symptom/trace header.
- **§3 Root cause** — top suspect marked **(candidate — verify)**.
- **§4 Blast radius** — impact summary for that symbol.

Sections 2, 5, 6, 7 remain empty templates — human/agent judgment only.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| `speclaw bug` top-level command | User chose `draft --bug`; fewer entrypoints |
| Security mode in v1 | User deferred; adds disclosure state machine |
| Explore skill branch for RCA | Different script; loads on every session |
| Configurable weights | Invites miscalibration without cases |
| Auto-fill all seven sections | Spec Kit "illusion of work" risk |

## Trade-offs

- **+1 MCP tool** (22 total) — `MINIMAL_OMIT`; tool-surface (#13) may consolidate later.
- **Homonym symbols** — file:line resolution first; caller-count penalty.
- **Bug-as-escape-hatch** — harder gates + doctor feature/bug ratio mitigate.
- **No verify-ci revert gate** — documented in reports discipline; spike later.

## File plan

```
src/modules/lawbook/bugfix.ts           NEW
src/modules/lawbook/stack-parse.ts      NEW
src/modules/lawbook/investigate.ts      NEW
src/modules/lawbook/levels.ts           changeType, bug matrix
src/modules/lawbook/engine.ts           bug validate/archive branches
src/modules/lawbook/register.ts         +lawbook_investigate
src/shared/exposure.ts                  MINIMAL_OMIT
src/cli/commands/lawbook.ts             draft --bug, investigate
src/modules/foundation/doctor.ts        bug/feature distribution
assets/commands|skills/investigate      NEW
assets/commands|skills/draft            --bug branch
assets/rules/spec-reports-disciplines   bug report: failing test before fix
test/unit/{stack-parse,investigate,bugfix}.test.ts
test/integration/bugfix-flow.test.ts
test/unit/lawbook-engine.test.ts        extend
test/unit/prevention.test.ts            law block parse (section 7 template)
```
