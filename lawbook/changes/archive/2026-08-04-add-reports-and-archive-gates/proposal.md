# Proposal — add-reports-and-archive-gates

## Why

Two gaps in the lawbook workflow let low-quality or incomplete changes reach the
archive:

1. **No evidence of testing travels with a change.** The `build` step runs
   gates and manual verification, but the *results* live only in the agent's
   transcript. A reviewer opening the change sees no unit / integration / e2e
   results per discipline. There is nowhere durable that says "this is what was
   tested and this is how it went."

2. **Archive is not gated on completeness.** `specArchive`
   (`src/modules/lawbook/engine.ts:236`) promotes and moves a change even when
   tasks are still unchecked, when the delta specs were never synced to
   canonical, or when the working tree carries more than the change's specs
   account for. `specValidate` (`engine.ts:138`) only checks that artifacts
   exist and specs are normative — not that the work is *done*. Building on
   `reconcile-specs-on-sync` (which makes the agent *recommend* a sync on
   drift), this change makes the completeness checks a **hard block**.

## What

1. **A `reports/` folder in every change.** `draft` scaffolds it; `build`
   populates per-discipline reports (`backend.md`, `frontend.md`, and any other
   relevant to the feature) with the actual results of what was tested — unit,
   integration, and end-to-end — plus the commands run and their real output.
   Which reports are relevant is decided per feature (a backend-only change
   needs no `frontend.md`).

2. **A hard archive gate (deterministic, in the engine).** `specArchive`
   refuses to archive when any of these hold, returning the reason instead of
   proceeding:
   - any task in `tasks.md` is still unchecked (`- [ ]`);
   - the change has no `reports/` folder, or it is empty;
   - the delta specs are not synced — the canonical `lawbook/specs/**` does not
     already match the change's delta specs (i.e. `sync` was not run after the
     last spec edit).

   The engine block covers both the `lawbook_archive` MCP tool and the CLI,
   since both call `specArchive`.

3. **Agent-side reconciliation stays the judgment layer.** The "local changes
   are more than expected" case is caught by the reconciliation review from
   `reconcile-specs-on-sync`: the agent updates the delta specs to match what
   was built, which then must be `sync`ed — and the deterministic "specs synced"
   gate refuses the archive until it is. So drift cannot be archived silently.

## Non-goals

- No specific test framework is mandated. speclaw itself has no unit runner yet;
  a report may state that and record the gates + manual verification that stood
  in. The requirement is *evidence*, not a particular tool.
- The gate does not judge report *quality* or *coverage* — that is review's job.
  It enforces presence and completeness signals it can verify deterministically.
- No change to how delta specs are promoted (`specSync` stays a deterministic
  copy).

## Migrations

None. Existing archived changes are untouched; the `reports/` requirement and
the archive gate apply to changes drafted or archived after this lands.
