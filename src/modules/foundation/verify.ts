import { performance } from "node:perf_hooks";
import { openDb, indexExists } from "../compass/db.js";
import { hasBatchBackend, isActiveLaw, loadManifestForVerify } from "./laws.js";
import { runDepsLaw } from "./deps.js";
import { runGraphLaw } from "./graph.js";
import {
  BatchEngine,
  Finding,
  SkippedLaw,
  UnknownEntry,
  VerifyArgs,
  VerifyReport,
} from "./verify-model.js";

export type {
  BatchEngine,
  Finding,
  SkippedLaw,
  UnknownEntry,
  VerifyArgs,
  VerifyReport,
} from "./verify-model.js";
export { underPaths } from "./verify-model.js";

// The batch verifier behind the `law_verify` tool and the `speclaw laws verify`
// CLI. It evaluates every law whose backend reads the Compass graph (`deps`,
// `graph`) without a language model, and reports a result honest enough to
// trust: it distinguishes passed / failed / skipped / unknown and never counts a
// skip or an unknown as a pass. It is the single home of graph evaluation; the
// action-time evaluator (`check.ts`) shares this module's model and scope matcher
// but never runs these engines, so no index query lands on the keystroke budget.

/**
 * Verify the project's deterministic `deps`/`graph` laws against the Compass
 * index and return a four-state report.
 *
 * When the project has no index, every selected batch law is reported as
 * `skipped` with reason `no-index` (never silently passed). When the gitignored
 * manifest file is missing, the shipped seed is used so a clean clone does not
 * report an empty pass. Each evaluated law lands in exactly one of `passed` /
 * `failed` / `unknown`: it fails when the engine produced a finding, is
 * `unknown` when it produced none but rests on unresolved edges (which could
 * hide a violation), and passes otherwise.
 *
 * @param args - The project, and optional `paths` / `engines` / `lawIds` filters.
 * @returns The {@link VerifyReport}.
 */
export function verifyLaws(args: VerifyArgs): VerifyReport {
  const start = performance.now();
  const findings: Finding[] = [];
  const skipped: SkippedLaw[] = [];
  const unknown: UnknownEntry[] = [];
  let passed = 0;
  let failed = 0;

  const done = (): VerifyReport => ({
    schemaVersion: 1,
    summary: {
      evaluated: passed + failed + unknown.length,
      passed,
      failed,
      skipped: skipped.length,
      unknown: unknown.length,
    },
    findings,
    skipped,
    unknown,
    elapsedMs: performance.now() - start,
  });

  const manifest = loadManifestForVerify(args.projectPath);

  const engines = args.engines;
  const selected = manifest.laws.filter((law) => {
    if (!isActiveLaw(law)) {
      skipped.push({
        lawId: law.id,
        reason: "draft",
        detail: "status=draft — pending human activation; does not gate",
      });
      return false;
    }
    if (!hasBatchBackend(law)) return false;
    if (args.lawIds && !args.lawIds.includes(law.id)) return false;
    if (engines && !engines.includes(law.verification.kind as BatchEngine)) return false;
    return true;
  });
  if (selected.length === 0) return done();

  if (!indexExists(args.projectPath)) {
    for (const law of selected) {
      skipped.push({
        lawId: law.id,
        reason: "no-index",
        detail: "no .speclaw/index.db — build it with the compass_index tool",
      });
    }
    return done();
  }

  const db = openDb(args.projectPath);
  try {
    for (const law of selected) {
      let result;
      try {
        result =
          law.verification.kind === "deps"
            ? runDepsLaw(db, law, args.paths)
            : runGraphLaw(db, law, args.paths);
      } catch (err) {
        skipped.push({ lawId: law.id, reason: "engine-error", detail: (err as Error).message });
        continue;
      }
      findings.push(...result.findings);
      if (result.findings.length > 0) {
        failed++;
      } else if (result.unresolved > 0) {
        unknown.push({
          lawId: law.id,
          detail: `evaluated with ${result.unresolved} unresolved reference(s) — result unknown`,
        });
      } else {
        passed++;
      }
    }
  } finally {
    db.close();
  }

  return done();
}
