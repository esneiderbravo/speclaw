import fs from "node:fs";
import path from "node:path";

// Covers: req~compass-call-log~1

/** Live call-log file name under `.speclaw/`. */
export const COMPASS_CALL_LOG = "compass-calls.jsonl";

/** The live log rotates to `.1` once it grows past this many bytes. */
export const CALL_LOG_ROTATE_BYTES = 256 * 1024;

/** Readers never look further back than this many bytes of the live log. */
export const CALL_LOG_READ_BYTES = 64 * 1024;

/**
 * Compass tools whose calls count as "looked through the graph" evidence.
 * `compass_index` and nudge entries are logged too but are not evidence.
 */
export const EVIDENCE_TOOLS: ReadonlySet<string> = new Set([
  "compass_explore",
  "compass_find",
  "compass_diff_context",
  "compass_impact",
  "compass_trace",
  "compass_search",
  "compass_recall",
]);

/** Tool name the Compass-first nudge records for its rate limit. */
export const NUDGE_ENTRY = "nudge";

/** One parsed call-log line. */
export interface CompassCall {
  /** ISO timestamp of the call. */
  at: string;
  /** MCP tool name (canonical or alias), or `nudge`. */
  tool: string;
}

/** True when `tool` counts as Compass evidence. */
export function isEvidenceTool(tool: string): boolean {
  return EVIDENCE_TOOLS.has(tool);
}

function logPath(projectPath: string): string {
  return path.join(projectPath, ".speclaw", COMPASS_CALL_LOG);
}

/**
 * Rotate the live log to `.1` when it is over the cap, tolerating a race with
 * other processes doing the same.
 *
 * The live file is first renamed to a name unique to this process, so two
 * rotators can never both move the same file onto `.1`. If what was claimed is
 * not over the cap, another process rotated first and this one grabbed its
 * fresh live file: those lines are appended back to the live log instead of
 * replacing `.1`, so `.1` always holds a full previous generation and no
 * recent entry disappears. A missing live file (lost race) is ignored.
 *
 * @param file - Absolute path of the live log.
 */
export function rotateCallLog(file: string): void {
  const claimed = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.renameSync(file, claimed);
  } catch {
    return; // nothing to rotate, or another process already took it
  }
  try {
    if (fs.statSync(claimed).size > CALL_LOG_ROTATE_BYTES) {
      fs.renameSync(claimed, `${file}.1`);
      return;
    }
    fs.appendFileSync(file, fs.readFileSync(claimed));
    fs.rmSync(claimed, { force: true });
  } catch {
    /* best-effort: a leftover .tmp is harmless and never read */
  }
}

/**
 * Append one `{at, tool}` line to `.speclaw/compass-calls.jsonl`.
 *
 * Best effort: creates `.speclaw/` when missing, rotates the live log to
 * `.jsonl.1` (replacing any earlier generation) when it exceeds 256 KiB — see
 * {@link rotateCallLog} — and never throws: a failed write must not fail or
 * delay the Compass tool.
 *
 * @param projectPath - Project root.
 * @param tool - MCP tool name the call maps to.
 * @param at - Call time; defaults to now.
 */
export function recordCompassCall(projectPath: string, tool: string, at: Date = new Date()): void {
  try {
    const file = logPath(projectPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      /* no live log yet */
    }
    if (size > CALL_LOG_ROTATE_BYTES) rotateCallLog(file);
    fs.appendFileSync(file, JSON.stringify({ at: at.toISOString(), tool }) + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

/** Options for {@link readCompassCalls}. */
export interface ReadCompassCallsOptions {
  /** Keep only entries whose `at` is at or after this epoch-ms instant. */
  sinceMs?: number;
  /** Tail size to read per generation; defaults to 64 KiB. */
  maxBytes?: number;
}

/** Read the last `maxBytes` of `file`; `fromStart` when the whole file was read. */
function readTail(file: string, maxBytes: number): { raw: string; fromStart: boolean } | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    // Read one byte before the window so a cut that lands exactly on a line
    // boundary keeps that whole first line.
    const start = Math.max(0, size - maxBytes - 1);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let raw = buf.toString("utf8");
    // Mid-file: everything up to the first newline is a partial (or the extra
    // boundary byte) and is dropped.
    if (start > 0) {
      const nl = raw.indexOf("\n");
      raw = nl === -1 ? "" : raw.slice(nl + 1);
    }
    return { raw, fromStart: start === 0 };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Parse log lines, skipping malformed ones. */
function parseLines(raw: string): Array<CompassCall & { ms: number }> {
  const out: Array<CompassCall & { ms: number }> = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const { at, tool } = row as { at?: unknown; tool?: unknown };
    if (typeof at !== "string" || typeof tool !== "string") continue;
    const ms = Date.parse(at);
    if (Number.isNaN(ms)) continue;
    out.push({ at, tool, ms });
  }
  return out;
}

/**
 * Read the bounded tail of the call log.
 *
 * Reads at most `maxBytes` from the end of the live file, drops a partial
 * first line, and skips lines that fail to parse. When the whole live file fit
 * in that window but does not reach back to `sinceMs` (or no `sinceMs` was
 * given), the tail of the previous generation `.1` is read too — at most
 * another `maxBytes` — so a rotation never hides evidence from the current
 * window. Returns `[]` when no log exists.
 *
 * @param projectPath - Project root.
 * @param opts - Optional `sinceMs` filter and per-generation tail size.
 */
export function readCompassCalls(
  projectPath: string,
  opts: ReadCompassCallsOptions = {},
): CompassCall[] {
  const maxBytes = Math.max(1, opts.maxBytes ?? CALL_LOG_READ_BYTES);
  const file = logPath(projectPath);
  const live = readTail(file, maxBytes);
  const liveRows = live ? parseLines(live.raw) : [];
  let rows = liveRows;
  const oldest = liveRows.length ? Math.min(...liveRows.map((r) => r.ms)) : Infinity;
  const reachesSince = opts.sinceMs !== undefined && oldest <= opts.sinceMs;
  if ((!live || live.fromStart) && !reachesSince) {
    const prev = readTail(`${file}.1`, maxBytes);
    if (prev) rows = [...parseLines(prev.raw), ...liveRows];
  }
  const out: CompassCall[] = [];
  for (const { at, tool, ms } of rows) {
    if (opts.sinceMs !== undefined && ms < opts.sinceMs) continue;
    out.push({ at, tool });
  }
  return out;
}

/** Count evidence calls in `calls`. */
export function countEvidence(calls: readonly CompassCall[]): number {
  let n = 0;
  for (const c of calls) if (isEvidenceTool(c.tool)) n++;
  return n;
}
