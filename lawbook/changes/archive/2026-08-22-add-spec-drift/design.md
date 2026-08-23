# Design — spec↔code drift (full surface)

## Approach

| Concern | Module | Why |
|---|---|---|
| `body_hash` / `norm_hash` during index | `compass` (`hash.ts` + indexer walk) | Tree already in memory; derived columns belong in `.speclaw/index.db` |
| Anchor extract / resolve / seal / classify / reverse | `lawbook` (`anchors.ts`, `drift.ts`) | Specs + archive lifecycle are lawbook's domain; **canonical store is committed JSON** |
| Git age (`drift_days`, commits since seal) | `shared/git-history` (reuse `headSha`, `logForPath`, `lastTouch`) | Plumbing already exists; extend only if subject/batch helpers are missing |
| CLI / MCP / doctor / verify | thin transports | Same report core |

**Truth model (non-negotiable):**

```
lawbook/anchors/<capability>.json   ← committed source of truth
        ↓ rehydrate on openDb / drift start
.spec_anchors (SQLite projection)   ← joins against nodes for classify
```

Deleting `.speclaw/` or bumping schema MUST NOT lose seals. CI clones must see
anchors without a prior local archive.

**Extraction priority** (precision over recall):

1. `covers-link` — from `coverage_links` / `req~…~N` cited in the delta (handshake with coverage)
2. backtick identifiers / paths inside a `### Requirement:` section
3. camelCase/PascalCase tokens that **resolve uniquely** in the graph
4. unresolved **casing** candidates are **dropped silently**; unresolved
   **backtick** / **covers-link** become `orphan`

**Classification** uses the two-hash table from the roadmap. `moved` and
`changed-cosmetic` never fail `--fail-on semantic`. `unanchored` and
`stale-hash` are informational (except `--fail-on any` for orphans/ambiguous
per the severity table).

**Defaults (user decisions):**

| Surface | Default |
|---|---|
| Interactive `speclaw drift` | `--fail-on semantic` (rojo en máquina) |
| `speclaw verify --ci` | include drift semantic/deleted as errors in SARIF |
| Reverse | enabled only when `capabilities[].paths` exist; else explicit disabled message |
| Bootstrap | `--reseal` (and ship-time dogfood) photographs current bodies |

**Normalizer:** tree-sitter structural walk (`NORMALIZER_VERSION` in JSON +
meta). Version mismatch ⇒ `stale-hash`, invite `--reseal` — never mass false
semantic.

## Alternatives weighed

| Option | Rejected because |
|---|---|
| Store anchors only in SQLite | Lost on reindex/CI clone — gate becomes decorative |
| Embed anchors in `spec.md` HTML comments | Mixes tool-owned and human-owned content; harder diffs |
| Text-only normalizer | Breaks Python indentation and string literals |
| Embeddings for "semantic" drift | Non-deterministic; LexicalEmbedder is not semantic |
| Fail archive on zero anchors | Breaks every existing project on upgrade |
| MVP without reverse/doctor/verify | User chose full surface |

## Trade-offs

- Local renames inside a sealed body report `changed-semantic` — accepted;
  `--reseal --capability X` is the audited escape hatch.
- Reverse without `paths` is silent/disabled — better than 400 false "missing
  specs".
- Schema bump alone after coverage means a second forced reindex in two
  releases — accepted; combining would have delayed coverage.
- Agent response for `lawbook_drift` stays ≤ ~700 tokens (summary + top
  defects); full detail is CLI/`--json`.

## File plan (implementation)

```
src/modules/compass/hash.ts          NEW structural + raw hash
src/modules/compass/db.ts            SCHEMA 6, nodes columns, spec_anchors, rehydrate
src/modules/compass/indexer.ts       populate hashes in existing walk
src/modules/lawbook/anchors.ts       extract / resolve / read-write JSON
src/modules/lawbook/drift.ts         classify, reverse, report, exit codes
src/modules/lawbook/engine.ts        seal inside specArchive; optional reseal API
src/modules/lawbook/register.ts      lawbook_drift
src/cli/commands/drift.ts            speclaw drift
src/modules/foundation/doctor.ts     drift summary line
src/modules/foundation/verify.ts     optional drift findings → SARIF
lawbook/anchors/*.json               dogfood seals
```
