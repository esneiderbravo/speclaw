# Tasks — add-test-suite-and-ci-gates

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/add-test-suite-and-ci-gates` off `main` (created at draft time).

- [x] **Toolchain: wire the test runner.** Added `tsconfig.test.json` (extends
      base; `rootDir: "."`, `outDir: "dist-test"`, includes `src` + `test`), the
      `pretest`/`test` scripts in `package.json` (compile + `prep-test-assets` +
      `node --test` with the 80% coverage floor), and `dist-test/` to
      `.gitignore`. Also `scripts/prep-test-assets.mjs` to stage `package.json`
      and module `assets/` into `dist-test/`. `files` stays `["dist",
      "ATTRIBUTION.md"]`. **Corrected mid-build:** Node's `--test-coverage-*`
      flags are 0–100 percentages, so the floor is `=80`, not `=0.8`.

- [x] **Test helpers + fixtures.** `test/helpers/{env,cli,contracts,fixtures}.ts`
      — `tmpRepo()`, `runCli()`, the stub-MCP `captureTools()`, and the
      multi-language sample sources with a known call graph.

- [x] **Unit tests.** `test/unit/*` cover `shared/{render,paths,mcp,version,
      install,manifest,agents}`, `cli/lib/args`, `tools/packs`, `compass/embedder`,
      `foundation/ownership`, and `lawbook/engine` — happy path + edge/error each.

- [x] **Integration tests.** `test/integration/*` cover the Compass pipeline
      (index → search/explore/recall/impact/trace → visualize/watch, incremental
      + prune), `compass/db` (schema/stale/reset), the lawbook engine flow, and
      `foundation/{scaffold,doctor}` against temp fixtures.

- [x] **Contract tests.** `test/contract/registers.test.ts` drives all four
      `register.ts` through a stub MCP server: tool names, Zod validation, and
      `text()` wrapping via every handler.

- [x] **End-to-end tests.** `test/e2e/cli.test.ts` spawns the built CLI
      (`help`, `doctor`, `lawbook init/list`, `index`, `explore`, `search`) in
      scratch repos and asserts exit code + output.

- [x] **CI: add the `test` job.** `.github/workflows/ci.yml` gains a `test` job
      (Node 24 for stable `node:sqlite`; `npm ci` → `npm run build` → `npm test`)
      beside `build`. Triggers unchanged.

- [x] **Branch protection: codify + apply script.** `.github/branch-protection.json`
      (required checks `build`+`test`, `strict`, PR required, linear history, no
      force-push/deletion) and `scripts/apply-branch-protection.sh`. **Not run by
      the agent** (Rule 6) — the maintainer applies it after the `test` check has
      reported once; the script's read-only slug resolution was verified.

- [x] **Amend the standard.** `docs/standards/testing-standards.md` now describes
      the wired `node:test` runner, the four-layer taxonomy, the 80% floor, and
      the CI + branch-protection gates; stale "no unit-test runner yet" claims
      removed from it and `backend-standards.md`. The scaffolded foundation
      template is generic (parameterized) and needed no change.

- [x] **Review and update the affected tests.** Tests are deterministic and
      isolated (temp dirs, no network, no repo `.speclaw/`); the watcher reindex
      test was made deterministic with an FSEvents warm-up. No assertion weakened.

- [x] **Run the quality gates and verify they pass.** `npm run check` → pass;
      `npm run build` → pass; `npm test` → 112/112, coverage 97.80% lines /
      91.80% branches / 98.04% functions (floor 80). Real output in `reports/`.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself.** Demonstrated the floor fails below threshold
      (`--test-coverage-lines=99` → exit 1); dry-ran the branch-protection script
      (slug resolves, no settings mutated); drove the built CLI via the e2e
      suite. Recorded in `reports/`.

- [x] **Produce the discipline reports under `reports/`.** `reports/backend.md`
      and `reports/e2e.md`, each with the full spec-scenario coverage table.

- [x] **Update the technical documentation touched by the change.** Testing and
      backend standards updated; README has no stale gate references.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
