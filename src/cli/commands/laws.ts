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
import {
  digestText,
  driftedStrictPaths,
  LockChangedError,
  lockPreservedWarning,
  onDiskDigest,
  prepareIntegrityText,
  readLockfile,
  type ConfirmedDrift,
  type LockRefreshResult,
  type SpeclawLock,
} from "../../modules/foundation/lock.js";
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
      if (report.failed.length || report.lockError) process.exit(1);
      return;
    }
    ui.heading("speclaw laws compile");
    ui.ok(
      `${report.lawCount} active · ${report.draftCount} draft · ` +
        `${report.written.length} written · ${report.unchanged.length} unchanged` +
        (report.failed.length ? ` · ${report.failed.length} failed` : ""),
    );
    for (const f of report.failed) ui.warn(`${f.path}: ${f.error}`);
    for (const rel of report.lockPreserved) ui.warn(lockPreservedWarning(rel));
    if (report.lockError) ui.err(lockUnreadableMessage(report.lockError));
    if (report.failed.length || report.lockError) process.exit(1);
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
    await runLock(flags);
    return;
  }

  if (sub === "scan") {
    // Text and --json share one exit rule: 1 on an unreadable lock or any
    // error-severity finding, else 0.
    // Covers: req~injection-scan~1, req~laws-integrity-cli~1
    const report = verifyIntegrity({ projectPath: process.cwd(), checks: "scan" });
    const failed =
      report.lockError !== undefined || report.findings.some((f) => f.severity === "error");
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
      if (failed) process.exit(1);
      return;
    }
    ui.heading("speclaw laws scan");
    if (report.lockError !== undefined) ui.err(report.lockError);
    if (report.findings.length === 0 && report.lockError === undefined) {
      ui.ok("No injection findings.");
      return;
    }
    for (const f of report.findings) {
      const line = `${f.path}:${f.line}`;
      const msg = `${c.cream(f.detector)} — ${line} ${f.message}`;
      if (f.severity === "error") ui.err(msg);
      else ui.warn(msg);
    }
    if (failed) process.exit(1);
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

/**
 * Injectable TTY check shared by `laws accept` and `laws lock --force`.
 * Test-only seam: product code must never reassign it.
 */
export const lawsTty: { isInteractive: () => boolean } = { isInteractive: isInteractiveTty };

/**
 * Injectable yes/no prompt shared by `laws accept` and `laws lock --force`.
 * Defaults to No; a cancelled prompt counts as No. Test-only seam: product
 * code must never reassign it.
 */
export const lawsConfirm: { confirm: (message: string) => Promise<boolean> } = {
  confirm: async (message) => {
    const answer = await clack.confirm({ message, initialValue: false });
    return !clack.isCancel(answer) && answer === true;
  },
};

/** The error shown when `speclaw.lock` exists but cannot be read. */
function lockUnreadableMessage(detail: string): string {
  return (
    `${detail} — speclaw.lock was left unchanged. Repair it (resolve merge markers, ` +
    "or upgrade speclaw for a newer lockfileVersion); to start over, delete it and " +
    "run `speclaw laws lock`."
  );
}

/** The `by` recorded in `accepted[]` entries for a human acceptance. */
function acceptedBy(): string {
  return os.userInfo().username || process.env.USER || "unknown";
}

/**
 * `speclaw laws lock [--force] [--note <text>]`: create or refresh
 * `speclaw.lock`. A drifted strict file keeps its locked digest and is warned
 * about. `--force` re-baselines drifted files and records an `accepted[]` entry
 * for each; it requires an interactive TTY (without one it exits 1 before
 * touching the lock) and an explicit confirmation after listing each drifted
 * path with its locked and on-disk digests (No or cancel exits 1, lock
 * unchanged). If the drifted set, a locked digest, or an on-disk digest
 * changed while the prompt was open, nothing is written and it exits 1. An
 * existing lock that cannot be read is never overwritten: the
 * command exits 1.
 *
 * @param flags - Parsed CLI flags (`--force`, `--note`, `--json`).
 */
// Covers: req~laws-accept-human~1, req~laws-integrity-cli~1
export async function runLock(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const force = Boolean(flags.force);
  if (force && !lawsTty.isInteractive()) {
    ui.err(
      "`speclaw laws lock --force` requires an interactive TTY — re-baselining is human-only.",
    );
    process.exit(1);
  }

  let prev: SpeclawLock | null;
  let drifted: string[];
  try {
    prev = readLockfile(cwd);
    drifted = driftedStrictPaths(cwd, prev);
  } catch (err) {
    ui.err(lockUnreadableMessage((err as Error).message));
    process.exitCode = 1;
    return;
  }

  let rebaseline: { by: string; note?: string; confirmed: ConfirmedDrift[] } | undefined;
  if (force && drifted.length) {
    ui.heading("speclaw laws lock --force");
    const confirmed: ConfirmedDrift[] = [];
    for (const rel of drifted) {
      const locked = prev!.files[rel]!.digest;
      const actual = onDiskDigest(cwd, rel) ?? "(missing)";
      confirmed.push({ path: rel, locked, actual });
      ui.info(rel);
      ui.plain(`  expected ${locked}`);
      ui.plain(`  actual   ${actual}`);
    }
    const n = drifted.length;
    const approved = await lawsConfirm.confirm(
      `Re-baseline ${n} drifted strict file${n === 1 ? "" : "s"} in speclaw.lock?`,
    );
    if (!approved) {
      ui.warn("Re-baseline cancelled — lockfile unchanged.");
      process.exitCode = 1;
      return;
    }
    const note =
      typeof flags.note === "string" && flags.note.trim() ? flags.note.trim() : undefined;
    rebaseline = { by: acceptedBy(), note, confirmed };
  }

  let result: LockRefreshResult;
  try {
    // With `confirmed`, the refresh re-checks the drift and digests the human
    // approved against the snapshot it writes, and throws on any difference.
    result = refreshLockfile(cwd, { drifted, rebaseline });
  } catch (err) {
    if (err instanceof LockChangedError) {
      ui.err(
        `${err.message} — speclaw.lock was not written. Re-run ` +
          "`speclaw laws lock --force` to review the current digests.",
      );
    } else {
      ui.err(lockUnreadableMessage((err as Error).message));
    }
    process.exitCode = 1;
    return;
  }
  const { lock } = result;
  if (flags.json) {
    console.log(JSON.stringify(lock, null, 2));
    for (const rel of result.preserved) process.stderr.write(lockPreservedWarning(rel) + "\n");
    return;
  }
  ui.heading("speclaw laws lock");
  ui.ok(
    `Wrote speclaw.lock — ${Object.keys(lock.files).length} file(s), ` +
      `${Object.keys(lock.symlinks).length} symlink(s), root ${lock.root.slice(0, 19)}…`,
  );
  for (const rel of result.preserved) ui.warn(lockPreservedWarning(rel));
  for (const rel of result.rebaselined)
    ui.warn(`${rel} re-baselined by --force (recorded in accepted[]).`);
  if (result.pruned)
    ui.info(`Pruned ${result.pruned} stale accepted entr${result.pruned === 1 ? "y" : "ies"}.`);
}

async function runAccept(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  if (!lawsTty.isInteractive()) {
    ui.err("`speclaw laws accept` requires an interactive TTY — digest acceptance is human-only.");
    process.exit(1);
  }

  const rel = typeof flags._[1] === "string" ? flags._[1] : "";
  if (!rel) {
    ui.err(`Usage: ${ui.code("speclaw laws accept <path>")}`);
    process.exit(1);
  }

  let lock: SpeclawLock | null;
  try {
    lock = readLockfile(cwd);
  } catch (err) {
    ui.err(lockUnreadableMessage((err as Error).message));
    process.exitCode = 1;
    return;
  }
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
  const confirmed = await lawsConfirm.confirm(`Update speclaw.lock digest for ${rel}?`);
  if (!confirmed) {
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

  const by = acceptedBy();
  try {
    acceptLockPath(cwd, rel, { by, note });
  } catch (err) {
    // The lock is re-read here; it may have become unreadable during the prompt.
    // Only lock read errors get the repair advice; others (a scan-only path)
    // are reported as-is.
    const detail = (err as Error).message;
    ui.err(detail.startsWith("speclaw.lock:") ? lockUnreadableMessage(detail) : detail);
    process.exitCode = 1;
    return;
  }
  ui.ok(`Accepted ${rel} — lock updated (by ${by}).`);
}
