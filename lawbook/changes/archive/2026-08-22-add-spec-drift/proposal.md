# add-spec-drift — deterministic spec↔code drift detection

## Why

When a capability is archived, the project signs an agreement: *"the system
does this."* The agreement lives in markdown; the code keeps moving. Weeks
later a function the spec named has been rewritten, the spec still claims the
old behaviour, and every agent that reads the lawbook is lied to.

SDD frameworks with ~250k cumulative stars treat this as a **manual** problem
(Spec Kit `/converge` is a prompt; OpenSpec syncs documents, not document↔code).
speclaw already has a local symbol graph and, after `add-requirement-coverage`,
stable `req~…~N` ids plus `// Covers:` links. That is enough to seal a
structural fingerprint at archive time and re-check it later with a `SELECT`
and a hash — no model, no network, same answer every time.

This is roadmap piece **drift** (`docs/roadmap/runtime/drift.md`) — the product
headline — ordered after coverage (`trace`) and `git-history`.

## What

Ship the **full** drift surface (user decisions from explore):

1. **Per-node hashes** in Compass — `body_hash` (raw bytes) + `norm_hash`
   (tree-sitter structural walk; comment/format invariant; string-literal
   sensitive). Schema bump `"5"` → `"6"` with forced reindex.
2. **Committed anchors** at `lawbook/anchors/<capability>.json` (human-reviewable
   in PRs). SQLite `spec_anchors` is a **projection** rebuilt from those files —
   never the source of truth (`.speclaw/` is gitignored).
3. **Seal on archive** — `specArchive` extracts candidates (priority:
   `covers-link` → backtick → path → casing), resolves against the graph, writes
   JSON, projects into SQLite. Zero resolvable anchors ⇒ **warning**, never a
   block.
4. **Bootstrap reseal** — on first ship / `speclaw drift --reseal`, photograph
   every already-archived capability so the feature is useful immediately
   (decision A).
5. **Classify** — `unchanged` | `changed-cosmetic` | `changed-semantic` |
   `moved` | `deleted` | `orphan` | `ambiguous` | `unanchored` | `stale-hash`.
6. **Surfaces** — CLI `speclaw drift`, MCP `lawbook_drift` (defect-first,
   bounded tokens), default **`--fail-on semantic` even interactively**
   (user: rojo en máquina local). Exit `0`/`1`/`2` matching coverage/verify.
7. **Reverse drift** — public symbols under configured capability `paths` with
   no anchor; off / degraded (no noise) when paths are undeclared.
8. **Doctor line** + **`speclaw verify --ci` SARIF** integration for semantic /
   deleted findings.
9. **Agent Stop guidance** — document / hook hint to call `lawbook_drift` before
   claiming done (same posture as coverage).

## Non-goals

- Embedding- or LLM-based "does the prose still match?"
- α-renaming / identifier scrubbing in the normalizer (over-report local
  renames; escape hatch is audited `--reseal`)
- Blocking archive when extraction yields zero anchors
- Replacing `speclaw coverage` / `lawbook_coverage` (complementary: coverage =
  "did we implement+test?"; drift = "does the sealed body still match?")
- Renaming `speclaw trace` / `compass_trace` (call paths)

## Migrations

Yes — Compass `SCHEMA_VERSION` `"5"` → `"6"` (drop/recreate derived tables;
rehydrate anchors from `lawbook/anchors/*.json`). `speclaw update` migration
note for the next patch (0.3.9). Patch version bump on ship. Dogfood: reseal
this repo's capabilities and keep `speclaw drift` green on main.
