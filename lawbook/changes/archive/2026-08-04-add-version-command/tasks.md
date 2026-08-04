# Tasks — add-version-command

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/add-version-command` (created at draft time). Based on
      `feat/add-test-suite-and-ci-gates` — which is not yet merged into `main`
      but provides the `npm test` / e2e harness this change relies on. Rebase
      onto `main` once that PR merges.

- [x] **Add the version command handler.** Created
      `src/cli/commands/version.ts` (`runVersion`): prints the locally installed
      `pkgVersion()` to stdout, then — interactively only — force-checks npm and
      writes a clickable upgrade suggestion to stderr, best-effort. Wired
      `case "version": case "--version": case "-v":` in `src/cli/index.ts` to
      lazily import and call it.

- [x] **Document `--version` in HELP.** Added a `--version` line under the
      "Other" section of the `HELP` string in `src/cli/index.ts`.

- [x] **Share a clickable upgrade notice.** In `src/cli/lib/update-check.ts`,
      extracted the pure `upgradeNotice(current, latest)` + `npmPackageUrl(name)`
      (reused by `maybeNotifyUpdate`), rendering the newer version as an OSC 8
      hyperlink to the npm page; added `link(label, url)` to `src/cli/lib/ui.ts`.
      Kept the version aliases in `maybeNotifyUpdate`'s skip list so the notice
      is not printed twice.

- [x] **Review and update the affected tests.** Added e2e cases to
      `test/e2e/cli.test.ts`: spawn the built CLI with `--version`, `-v`, and
      `version`; assert stdout equals the `version` from `package.json` and exit
      code `0`; assert no `Unknown command`/HELP dump; assert `help` lists
      `--version`. No in-process unit test for the CLI-surface helpers — that
      would pull `ui`/`update-check` into the coverage denominator, against the
      `quality-gates` law; the upgrade rendering is verified by an isolated demo
      in manual verification.

- [x] **Run the quality gates and verify they pass** (see
      `docs/standards/testing-standards.md`): `npm run check` → pass;
      `npm run build` → pass; `npm test` → 116/116, coverage 97.80% lines /
      91.80% branches / 98.04% functions (floor 80). Real output in
      `reports/e2e.md`.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself, never the user.** Built, then ran `node dist/cli/index.js`
      `--version`/`-v`/`version` → each prints `0.1.14`, exit `0`; `help` lists
      `--version`; `--version` emits one stdout line and empty stderr; unknown
      command still exits `1`. Verified the upgrade suggestion rendering with an
      isolated demo (no network, no real-store writes): `upgradeNotice` under
      `FORCE_COLOR=1` emits the OSC 8 clickable link to the npm page, and the
      plain `label (url)` fallback when rich output is off. Recorded in
      `reports/e2e.md`.

- [x] **Produce the discipline reports under `reports/`** — `reports/e2e.md`
      (CLI behavior for the version command, with the spec-scenario coverage
      table).

- [x] **Update the technical documentation touched by the change.** Only the
      in-CLI HELP text changed; no `docs/` or `README` reference to the command
      surface is stale.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
