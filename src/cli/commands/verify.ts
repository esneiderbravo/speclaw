import fs from "node:fs";
import { Flags, list } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import { isShallowRepo } from "../../shared/git-history.js";
import { pkgVersion } from "../../shared/version.js";
import { parseFailOn, verifyExitCode } from "../../modules/foundation/ci.js";
import { toMarkdown } from "../../modules/foundation/report-md.js";
import { toSarif } from "../../modules/foundation/sarif.js";
import { loadManifestForVerify } from "../../modules/foundation/laws.js";
import { BatchEngine, verifyLaws, type VerifyReport } from "../../modules/foundation/verify.js";
import { driftFindingsForVerify } from "../../modules/lawbook/drift.js";

const FORMATS = new Set(["text", "json", "sarif", "markdown"]);

/**
 * `speclaw verify` — the CI orchestrator over {@link verifyLaws}. Formats and
 * exit codes live here; graph evaluation stays in `verify.ts`. `speclaw check`
 * (hooks) and `speclaw laws verify` (the thin batch twin) are unchanged.
 *
 * @param flags - Parsed CLI flags.
 */
export async function runVerify(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const ci = Boolean(flags.ci);
  if (ci) process.env.NO_COLOR = "1";
  const failOn = parseFailOn(flags["fail-on"]);
  if (failOn === null) {
    ui.err(`--fail-on must be error, warn, or info.`);
    process.exit(2);
  }
  const format =
    flags.format === undefined || flags.format === true ? "text" : String(flags.format);
  if (!FORMATS.has(format)) {
    ui.err(`--format must be text, json, sarif, or markdown.`);
    process.exit(2);
  }
  const strict = Boolean(flags["strict-engines"]);
  const engines = list(flags.engine).filter((e): e is BatchEngine => e === "deps" || e === "graph");
  const paths = list(flags.path);

  if (ci && isShallowRepo(cwd)) {
    ui.err("Shallow clone — speclaw cannot see the merge base. Check out with fetch-depth: 0.");
    process.exit(3);
  }

  const manifest = loadManifestForVerify(cwd);
  const report = verifyLaws({
    projectPath: cwd,
    paths: paths.length ? paths : undefined,
    engines: engines.length ? engines : undefined,
    lawIds: list(flags.law).length ? list(flags.law) : undefined,
  });

  // Structural spec↔code drift (when anchors exist) contributes semantic/deleted
  // findings into the same report stream used by SARIF / exit codes.
  for (const f of driftFindingsForVerify(cwd)) {
    report.findings.push({
      lawId: f.ruleId,
      severity: "error",
      engine: "graph",
      file: f.file,
      line: f.line,
      message: f.message,
    });
    report.summary.failed += 1;
  }

  const sarifPath = typeof flags.sarif === "string" ? flags.sarif : undefined;
  const jsonPath = typeof flags.json === "string" ? flags.json : undefined;

  if (sarifPath) {
    if (!writeOut(sarifPath, JSON.stringify(toSarif(report, sarifCtx(manifest.laws)), null, 2))) {
      process.exit(3);
    }
  }
  if (jsonPath) {
    if (!writeOut(jsonPath, JSON.stringify(report, null, 2))) process.exit(3);
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, toMarkdown(report));
    } catch (err) {
      ui.warn(`Could not write $GITHUB_STEP_SUMMARY: ${(err as Error).message}`);
    }
  }

  printReport(report, format, flags.json === true && !jsonPath);
  process.exit(verifyExitCode(report, { failOn, strictEngines: strict }));
}

function sarifCtx(laws: ReturnType<typeof loadManifestForVerify>["laws"]) {
  return { speclawVersion: pkgVersion(), laws };
}

function writeOut(file: string, body: string): boolean {
  try {
    fs.writeFileSync(file, body.endsWith("\n") ? body : body + "\n");
    return true;
  } catch (err) {
    ui.err(`Cannot write ${file}: ${(err as Error).message}`);
    return false;
  }
}

function printReport(report: VerifyReport, format: string, jsonStdout: boolean): void {
  if (jsonStdout || format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (format === "sarif") {
    // Rules need the loaded laws; re-read via the same fallback the run used.
    const laws = loadManifestForVerify(process.cwd()).laws;
    console.log(JSON.stringify(toSarif(report, sarifCtx(laws)), null, 2));
    return;
  }
  if (format === "markdown") {
    process.stdout.write(toMarkdown(report));
    return;
  }
  const { summary } = report;
  ui.heading("speclaw verify");
  ui.info(
    `${summary.passed} passed · ${c.red(String(summary.failed))} failed · ` +
      `${summary.skipped} skipped · ${summary.unknown} unknown ` +
      `(${report.elapsedMs.toFixed(1)} ms)`,
  );
  if (summary.evaluated === 0 && summary.skipped === 0) {
    ui.warn("0 batch laws evaluated — verify is not checking anything.");
  }
  for (const f of report.findings) {
    const at = f.line ? `${f.file}:${f.line}` : f.file;
    ui.warn(`${c.cream(f.lawId)} — ${at}${f.detail ? ` ${f.detail}` : ""}`);
  }
  for (const u of report.unknown) ui.plain(`  ? ${c.cream(u.lawId)} — ${u.detail}`);
  for (const s of report.skipped) {
    ui.plain(`  – ${c.cream(s.lawId)} — skipped: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`);
  }
  if (report.findings.length === 0 && summary.evaluated > 0) ui.ok("No violations.");
}
