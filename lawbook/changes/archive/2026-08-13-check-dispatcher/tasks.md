# Tasks — check-dispatcher

- [x] **Step 0: Create the feature branch (must be first).** `feat/check-dispatcher`.

## Model & manifest
- [x] Define the `Law` model in `src/modules/foundation/laws.ts`: discriminated-union
      `Verification` aligned with `executable-laws` §3.2, adding a `{ kind: "path" }`
      variant. Validate with `zod`; reuse the schema as the tool `inputSchema`.
- [x] Enforce model invariants (schema validation rejects unknown enforcement /
      verification kinds; `hasBackend` gates runtime evaluation to `path`).
- [x] Write `.speclaw/laws-manifest.json` from `init`/`update`; invalidate the
      in-memory index by manifest `mtime`.
- [x] Seed asset: the `path`-verifiable starter laws (incl. speclaw's own
      Project-specific laws) as `src/modules/foundation/assets/laws/laws-manifest.json`;
      `scripts/copy-assets.mjs` copies it to `dist/` (verified).

## Evaluator & tool
- [x] `src/modules/foundation/check.ts`: `checkAction()` — scope-filtered matching over a
      precompiled in-memory glob index, ACS verdicts, `evaluated` list, `elapsedMs`.
- [x] Fail-open: missing/corrupt manifest or any exception → `allow` + diagnostic.
- [x] `deny` reason cites law id + literal prose + source path.
- [x] Register `speclaw_check` in `src/modules/foundation/register.ts` with a
      ≤12-word description (no `defer_loading`). Registry now holds 20 tools.

## Hook compiler & merge
- [x] `src/modules/foundation/hooks.ts`: compile laws → `mcp_tool` hook entries per
      event (`PreToolUse`/`PostToolUse`/`Stop`/`InstructionsLoaded`); wire-format
      knowledge isolated here.
- [x] Idempotent merge into each agent's settings by identity
      `{type:"mcp_tool", server:"speclaw"}`; never touch foreign entries; record a
      `.speclaw.json` baseline; honor `--backup`.
- [x] Add `hooks?: { file, key }` to `AgentDef` (set for Claude Code); Cursor/Codex/
      Windsurf skipped by construction.

## CLI & doctor
- [x] `src/cli/commands/check.ts`: `speclaw check` with `--hook-payload -`
      (command-hook fallback, exit code 2 to block) and `--dry-run` (preview).
- [x] Extend `doctor.ts`: context-coverage section (loaded vs declared, post-`compact`
      note), glob validation (law id + malformed pattern), agent-asymmetry lines,
      "declared, no backend yet".

## Mandatory gates
- [x] Review and update the affected tests (contract test extended for `speclaw_check`).
- [x] Add tests: `test/unit/laws.test.ts`, `test/unit/check.test.ts` (incl. the p99
      latency benchmark), `test/unit/hooks.test.ts`, `test/integration/hooks.test.ts`,
      and the `register.ts` contract test.
- [x] Run the quality gates and verify they pass: `npm run check`, `npm run build`,
      `npm test` — all green; 176 tests, coverage above the 80% floor.
- [x] Perform manual verification (agent-run): scaffolded a throwaway repo, confirmed
      `.env` edit is blocked citing id + prose + path, and `speclaw doctor` reports
      coverage and validates globs (see reports/api.md).
- [x] Produce the discipline reports under `reports/` (backend.md, api.md, security.md).
- [x] Update the technical documentation (README's "request, not a guarantee" quote +
      enforcement section); bump version to 0.3.2 (roadmap-piece build cadence).
- [x] Archive the change within the same PR (`lawbook:archive`).
