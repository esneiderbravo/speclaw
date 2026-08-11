# Discipline reports — keep speclaw's regenerable content local

`build` fills this folder. Archive is blocked until it holds at least one
discipline report.

Expected report(s):

- **backend.md** — the change is entirely backend/CLI (install path, agents
  wiring, git detection). Must follow the required structure:
  1. Header — discipline, change, date, branch, environment/working directory.
  2. Gates-and-results table — each check, the exact command, the real result
     (`npm run check`, `npm run build`, the `node:test` suite) with pass/fail
     counts.
  3. Tests added or updated and what each asserts.
  4. Spec-scenario coverage — map every `#### Scenario` in
     `specs/local-content/spec.md` to how it was verified (test, gate, or manual
     step).
  5. Pre-existing / unrelated failures with proof, or "none".
  6. Manual steps not automated (e.g. the temp-dir CLI run), or "none".
  7. One-line verdict.
