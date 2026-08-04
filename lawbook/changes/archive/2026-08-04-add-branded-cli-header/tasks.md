# Tasks — add-branded-cli-header

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/add-branded-cli-header`, created at draft time off `main`.

- [x] **Add the header + unicode-safety helpers.** In `src/cli/lib/ui.ts`, added
      `header()` (one-line `◈ speclaw  v<pkgVersion()> · where specs become law`,
      styled with the existing `c.*`/`bold` helpers), a module-load `unicodeOn`
      check (true off-Windows; on Windows true only under `WT_SESSION` /
      `TERM_PROGRAM` / `CI`) mirroring the existing `colorOn` pattern, and a `G`
      glyph set resolved once from it (unicode vs. ASCII). Routed the existing
      `banner()`, `box()`, and `renderProgress()` through `G` so the whole
      branded surface degrades together. No new dependency.

- [x] **Inject the header centrally.** In `src/cli/index.ts`, add the
      interactive-command allowlist and a `maybeHeader(cmd)` that prints the
      header once — only when `process.stdout.isTTY` and `cmd` is in the
      allowlist (`help`/`update`/`agent`/`doctor`/`index`/`watch`/`lawbook`;
      `init` excluded — it keeps its fuller `banner()`) — and excludes
      `version`/`--version`/`-v`, the query family
      (`explore`/`search`/`recall`/`impact`/`trace`), and `mcp`. Call it from
      `main`/`dispatch` before the command runs.

- [x] **Review and update the affected tests.** Added e2e cases to
      `test/e2e/cli.test.ts`: with a forced TTY/`FORCE_COLOR` signal, `help`
      stdout includes the header line (name + version + tagline) ahead of
      `Usage:`; `--version` stdout equals the bare `package.json` version with no
      header; a query command's stdout has no header; and piped (non-TTY) `help`
      emits no header. No in-process unit test for the CLI-surface helpers —
      importing `ui` would pull it into the coverage denominator, against the
      `quality-gates` law; glyph selection is verified by an isolated demo in
      manual verification.

- [x] **Run the quality gates and verify they pass** (see
      `docs/standards/testing-standards.md`): `npm run check` → pass;
      `npm run build` → pass; `npm test` → 120/120, coverage 97.80% lines /
      91.80% branches / 98.04% functions (floor 80). Real output in
      `reports/e2e.md`.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself, never the user.** Built, then ran header-eligible commands
      (`help`, `agent list`, `doctor`) in a TTY and confirm one header line with
      the installed version and tagline; confirm `--version`/`-v`/`version` and a
      query command emit no header and keep clean stdout; confirm piped `help`
      has no header. Verify glyph selection with an isolated demo: with
      `platform=win32` simulated and `WT_SESSION`/`TERM_PROGRAM`/`CI` unset the
      header renders ASCII (`>`, `-`), and unicode on the host — no real-store
      writes. Record in `reports/e2e.md`.

- [x] **Produce the discipline reports under `reports/`** — `reports/e2e.md`
      (CLI header behavior, gate output, and the spec-scenario coverage table
      mapping every `#### Scenario` in `specs/cli/spec.md`).

- [x] **Update the technical documentation touched by the change.** Confirmed no
      `docs/` or `README` reference to CLI output is stale (grep found none), and
      no HELP text changed — nothing to update.

- [x] **Archive the change within the same PR** (`lawbook:archive`). Version
      bumped `0.1.14 → 0.1.15`; specs synced to `lawbook/specs/cli/spec.md`;
      archived via `speclaw lawbook archive`.
