import { Flags, list } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";
import * as clack from "@clack/prompts";
import { BatchEngine, verifyLaws } from "../../modules/foundation/verify.js";
import { compileLaws } from "../../modules/foundation/compile-laws.js";
import { importRulesFrom } from "../../modules/foundation/import-rules.js";
import {
  acceptLockPath,
  isInteractiveTty,
  refreshLockfile,
  verifyIntegrity,
} from "../../modules/foundation/integrity.js";
import { digestText, prepareIntegrityText, readLockfile } from "../../modules/foundation/lock.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LAWS_SUBS = "verify|compile|import|lock|accept|scan";

/**
 * `speclaw laws <subcommand>` — verify (batch), compile (dialects), import (draft),
 * lock / accept / scan (rule-file integrity).
 *
 * @param flags - Parsed CLI flags; `flags._[0]` is the subcommand.
 */
// Covers: req~laws-integrity-cli~1, req~laws-accept-human~1
export async function runLaws(flags: Flags): Promise<void> {
  const sub = flags._[0];
  if (sub === "compile") {
    const agents = list(flags.agent);
    const report = compileLaws({
      projectPath: process.cwd(),
      agents: agents.length ? agents : undefined,
    });
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    ui.heading("speclaw laws compile");
    ui.ok(
      `${report.lawCount} active · ${report.draftCount} draft · ` +
        `${report.written.length} written · ${report.unchanged.length} unchanged` +
        (report.failed.length ? ` · ${report.failed.length} failed` : ""),
    );
    for (const f of report.failed) ui.warn(`${f.path}: ${f.error}`);
    if (report.failed.length) process.exit(1);
    return;
  }

  if (sub === "import") {
    const from = typeof flags.from === "string" ? flags.from : "";
    if (!from) {
      ui.err(`Usage: ${ui.code("speclaw laws import --from rulesync")}`);
      process.exit(1);
    }
    try {
      const report = importRulesFrom(process.cwd(), from);
      if (flags.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      ui.heading("speclaw laws import");
      ui.ok(`${report.imported.length} imported · ${report.skipped.length} skipped`);
      for (const id of report.imported) ui.plain(`  + ${c.cream(id)}`);
    } catch (err) {
      ui.err((err as Error).message);
      process.exit(1);
    }
    return;
  }

  if (sub === "lock") {
    const lock = refreshLockfile(process.cwd());
    if (flags.json) {
      console.log(JSON.stringify(lock, null, 2));
      return;
    }
    ui.heading("speclaw laws lock");
    ui.ok(
      `Wrote speclaw.lock — ${Object.keys(lock.files).length} file(s), ` +
        `${Object.keys(lock.symlinks).length} symlink(s), root ${lock.root.slice(0, 19)}…`,
    );
    return;
  }

  if (sub === "scan") {
    const report = verifyIntegrity({ projectPath: process.cwd(), checks: "scan" });
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    ui.heading("speclaw laws scan");
    if (report.findings.length === 0) {
      ui.ok("No injection findings.");
      return;
    }
    for (const f of report.findings) {
      const line = `${f.path}:${f.line}`;
      const msg = `${c.cream(f.detector)} — ${line} ${f.message}`;
      if (f.severity === "error") ui.err(msg);
      else ui.warn(msg);
    }
    if (report.findings.some((f) => f.severity === "error")) process.exit(1);
    return;
  }

  if (sub === "accept") {
    await runAccept(flags);
    return;
  }

  if (sub !== "verify") {
    ui.err(
      `Unknown laws subcommand: ${sub ?? "(none)"} — try ${ui.code(`speclaw laws ${LAWS_SUBS}`)}.`,
    );
    process.exit(1);
  }

  const engines = list(flags.engine).filter((e): e is BatchEngine => e === "deps" || e === "graph");
  const report = verifyLaws({
    projectPath: process.cwd(),
    paths: list(flags.path).length ? list(flags.path) : undefined,
    engines: engines.length ? engines : undefined,
    lawIds: list(flags.law).length ? list(flags.law) : undefined,
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { summary } = report;
  ui.heading("speclaw laws verify");
  ui.info(
    `${summary.passed} passed · ${c.red(String(summary.failed))} failed · ` +
      `${summary.skipped} skipped · ${summary.unknown} unknown ` +
      `(${report.elapsedMs.toFixed(1)} ms)`,
  );
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

async function runAccept(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  if (!isInteractiveTty()) {
    ui.err("`speclaw laws accept` requires an interactive TTY — digest acceptance is human-only.");
    process.exit(1);
  }

  const rel = typeof flags._[1] === "string" ? flags._[1] : "";
  if (!rel) {
    ui.err(`Usage: ${ui.code("speclaw laws accept <path>")}`);
    process.exit(1);
  }

  const lock = readLockfile(cwd);
  if (!lock) {
    ui.err("No speclaw.lock — run `speclaw laws lock` first.");
    process.exit(1);
  }

  const abs = path.join(cwd, rel);
  if (!fs.existsSync(abs)) {
    ui.err(`File not found: ${rel}`);
    process.exit(1);
  }

  const raw = prepareIntegrityText(rel, fs.readFileSync(abs, "utf8"));
  const actual = digestText(raw);
  const expected = lock.files[rel]?.digest;
  ui.heading("speclaw laws accept");
  ui.info(`${rel}`);
  if (expected) ui.plain(`  expected ${expected}`);
  ui.plain(`  actual   ${actual}`);
  if (expected === actual) {
    ui.ok("Digest already matches the lock — nothing to accept.");
    return;
  }

  const noteFlag = typeof flags.note === "string" ? flags.note : undefined;
  const confirmed = await clack.confirm({
    message: `Update speclaw.lock digest for ${rel}?`,
    initialValue: false,
  });
  if (clack.isCancel(confirmed) || !confirmed) {
    ui.warn("Accept cancelled — lockfile unchanged.");
    process.exit(1);
  }

  let note = noteFlag;
  if (!note) {
    const n = await clack.text({
      message: "Optional note for the accept audit trail",
      placeholder: "why this digest is trusted",
    });
    if (!clack.isCancel(n) && n.trim()) note = n.trim();
  }

  const by = os.userInfo().username || process.env.USER || "unknown";
  acceptLockPath(cwd, rel, { by, note });
  ui.ok(`Accepted ${rel} — lock updated (by ${by}).`);
}
