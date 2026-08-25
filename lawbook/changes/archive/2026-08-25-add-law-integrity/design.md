# Design — add-law-integrity

## Decisions (confirmed in explore)

| # | Decision |
| --- | --- |
| Scope | Lock + scan + accept + CI + skills scan + dogfood in **one** PR |
| MCP | **No** new tool |
| Strict paths | `AGENTS.md`, `CLAUDE.md`, compiled dialect rules → verify **error** |
| Advisory paths | `docs/standards/*` (and similar personalized sources) → **warn** |
| Skills | Scan pack/skill prose + frontmatter correlation |
| Ceremony | Level 3 |
| Accept | Human TTY only; never MCP |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| canonicalize / digest / root / lock I/O | `foundation/lock.ts` (new) | Pure + file I/O; comment why not `.speclaw/` |
| injection normalize + detectors | `foundation/scan.ts` (new) | Independent of digest layer |
| orchestrate levels + report | `foundation/integrity.ts` (new) | `verifyIntegrity` — distinct from `verifyLaws` |
| Wire into CI verify | `cli/commands/verify.ts` + verify model | SARIF / exit codes already exist |
| CLI lock / accept / scan | `cli/commands/laws.ts` | Human `accept` with Clack |
| Provenance HTML block | `compile-laws` / dialects | Exclude from digest; data-only (no imperatives) |
| Refresh lock on write | `install` / `compileLaws` / `update` / `init` | Same loop that writes files |
| Doctor | `doctor.ts` | Root fast-path, `@import` 4 hops, outside pipeline |
| Ownership axis | reuse `isManaged` + new lock **policy** map | Do not conflate update ownership with integrity severity |

**Integrity policy (separate from `PERSONALIZED` / `MANAGED_TREES`):**

| Policy | Paths (examples) | Mismatch |
| --- | --- | --- |
| `strict` | `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/**`, `.github/instructions/**`, managed symlinks, speclaw blocks in `.coderabbit.yaml` | error |
| `advisory` | `docs/standards/**`, `docs/compass.md`, `LAWS.md` (source) | warn |
| `scan-only` | `.clinerules`, `.windsurfrules`, `BUGBOT.md`, skill packs under `ai-specs/` / packs | scan findings only |

**Accept:** shows unified diff, requires TTY confirmation, updates digest + root +
`accepted[]` with `at` / `by` / `note`. Scan errors still fail verify after accept.

**Missing lockfile:** not a failure; instruct `speclaw laws lock`.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| Lock-only MVP | Human chose full scope including scan + skills |
| New `laws_verify` MCP tool | Undoes tool-surface; accept must stay human-only |
| Lock under `.speclaw/` | Gitignored ⇒ invisible in PR diffs |
| Reuse name `verifyLaws` | Already means deps/graph batch verify |
| Sigstore in v1 | Key management product; hash+git covers PR threat model |

## Trade-offs

- **Lockfile fatigue** — aggressive canonicalize; only `strict` fails; measurable dogfood month.
- **Scanner false positives** — suppressions in config with required `note`; prefer warn for context-heavy detectors.
- **Personalized vs strict** — CLAUDE/AGENTS stay personalized for `update`, but **strict** for integrity (documented explicitly).
- **Naming collision** — keep `verifyLaws` untouched; export `verifyIntegrity`.

## File plan

```
src/modules/foundation/lock.ts           NEW
src/modules/foundation/scan.ts           NEW
src/modules/foundation/integrity.ts      NEW verifyIntegrity
src/modules/foundation/compile-laws.ts   provenance + refresh lock
src/modules/foundation/doctor.ts         root / imports / outside
src/modules/foundation/ownership.ts      document policy split (minimal API change)
src/cli/commands/laws.ts                 lock | accept | scan (+ keep verify/compile/import)
src/cli/commands/verify.ts               fold integrity findings
src/shared/install.ts / update.ts        refresh lock when writing
speclaw.lock                             dogfood in this repo
test/unit/lock.test.ts                   NEW
test/unit/scan.test.ts                   NEW
test/unit/integrity.test.ts              NEW
test/unit/accept.test.ts                 NEW
test/integration/integrity.test.ts       NEW
docs/standards + README                  honest limits + accept rationale
```

## Risks

- CRLF / autocrlf false positives → LF canonicalize + golden tests.
- Provenance self-hash loop → strip delimited block before digest.
- Agent “improving” accept into MCP → hard fail + contract test on tool list.
- Skills scan noise → start with error only for clear detectors; warn for URL/imperative-html.
