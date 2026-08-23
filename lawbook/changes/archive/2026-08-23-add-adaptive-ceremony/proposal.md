# add-adaptive-ceremony — ceremony levels 0–3 from graph signals

## Why

Lawbook today requires the **same four artifacts for every change** (`proposal.md`,
`design.md`, `tasks.md`, delta specs) plus `reports/`. That is correct for large
work and lethal for a typo or one-line bugfix: humans either invent empty
markdown or skip speclaw. Competitors that escape ceremony (BMAD levels, Kiro
Quick Spec, OpenSpec ff) still let a **human or LLM guess** the size. speclaw
is the only local SDD tool with a code graph — so it can **measure** size and
propose a level.

Roadmap piece **adaptive-ceremony** (#11). Explore locked the product decisions
below.

## What

1. **Ceremony levels 0–3** with a normative artifact matrix:
   - **0 `quick`** — `record.md` (inline checklist) + `reports/`; **no**
     proposal/design/delta specs.
   - **1 `light`** — record + tasks + ≥1 delta requirement + reports.
   - **2 `standard`** — proposal + tasks + specs + reports; design optional
     with justification in record.
   - **3 `full`** — today's four artifacts + reports (default / legacy).
2. **Graph-derived proposal** — signals from existing Compass APIs (`impact`
   files, `affectedTests`, `hotspots`, global-file globs, public-entry
   heuristics); deterministic score + cuts from `lawbook/config.yaml`;
   **human confirms**; overrides recorded.
3. **`change.json`** — persisted proposal, confirmed level, actor, promotions.
   Missing file ⇒ treat as **level 3**.
4. **Conditional validate/archive gates** — level 0 archives without delta
   sync; every level still requires checked tasks (or record checklist) and a
   real discipline report.
5. **Surfaces** — MCP `lawbook_level` (propose/set/promote/explain) in
   **`MINIMAL_OMIT`**; CLI `speclaw quick <name>` and draft/list level UX;
   update **LAWS.md** / `docs/standards/lawbook.md` to level-based ceremony.
6. **Doctor** — report archived-change level distribution (anti-abuse signal).
7. **Defaults now** — roadmap threshold defaults; calibrate later from doctor.

## Non-goals

- Auto-confirming level without a human (or recorded `config-default` only when
  explicitly configured)
- Rewriting Compass retrieval / hybrid search
- Per-path "minimum level" executable laws (document the config pattern; ship
  later if needed)
- Marketing-only README rewrite beyond the laws/standards + short CLI help

## Migrations

No Compass schema bump. Additive Lawbook state (`change.json`), config block
`ceremony:`, MCP/CLI surfaces. `speclaw update` migration note for **0.3.12**.
Existing changes without `change.json` keep full ceremony.

## Decisions locked in explore

| Decision | Choice |
| --- | --- |
| Level 0 without proposal/design/deltas | **Yes** — record + checklist + report |
| `lawbook_level` exposure | **`MINIMAL_OMIT`** |
| Update LAWS / lawbook standards | **Yes** |
| Threshold calibration | **Roadmap defaults now** |
| Scope | Full matrix 0–3 + quick + propose/set/promote + gates; doctor distribution in scope |
