import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { helpFor } from "../lib/help.js";
import { realPathOf } from "../../shared/paths.js";

/** Hook payloads are small JSON objects; anything larger is not one. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

/**
 * Split raw arguments into file paths: every token after `--`, and every
 * token before it that does not look like a flag.
 *
 * @param args - The arguments after `reindex-file`.
 * @returns The path arguments, in order.
 */
export function reindexPathArgs(args: readonly string[]): string[] {
  const out: string[] = [];
  let rest = false;
  for (const a of args) {
    if (rest) out.push(a);
    else if (a === "--") rest = true;
    else if (!a.startsWith("-")) out.push(a);
  }
  return out;
}

/**
 * The absolute file a `PostToolUse` hook payload edited: the first non-empty of
 * `tool_input.file_path` and `tool_input.notebook_path`, a relative value
 * resolved against the payload's absolute `cwd`, else against `fallbackCwd`.
 *
 * @param payload - The parsed hook JSON.
 * @param fallbackCwd - Base for a relative path when the payload has no absolute `cwd`.
 * @returns The absolute path, or `null` when the payload names no file.
 */
export function hookTarget(payload: unknown, fallbackCwd: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { tool_input?: unknown; cwd?: unknown };
  const input = p.tool_input as { file_path?: unknown; notebook_path?: unknown } | undefined;
  if (!input || typeof input !== "object") return null;
  const pick = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  const target = pick(input.file_path) ?? pick(input.notebook_path);
  if (target === null) return null;
  const base = typeof p.cwd === "string" && path.isAbsolute(p.cwd) ? p.cwd : fallbackCwd;
  return path.resolve(base, target);
}

/** Whether `abs` lies strictly inside `root` (symlinked prefixes such as macOS `/var` resolved). */
function insideRoot(root: string, abs: string): boolean {
  const rel = path.relative(realPathOf(root), realPathOf(abs));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Read stdin to its end; `null` when it exceeds the payload cap (still drained). */
async function readPayload(stdin: NodeJS.ReadableStream): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size <= MAX_PAYLOAD_BYTES) chunks.push(buf);
  }
  return size > MAX_PAYLOAD_BYTES ? null : Buffer.concat(chunks).toString("utf8");
}

/**
 * `speclaw reindex-file [--] <path>...` and its hook mode.
 *
 * - **Path mode** (paths given): re-index exactly those files in the foreground
 *   with Compass `indexFiles` — the detached child, tests, the bench, and manual
 *   use run this.
 * - **Hook mode** (no path): read the Claude Code `PostToolUse` JSON from stdin,
 *   take `tool_input.file_path` / `notebook_path`, and hand it to a detached
 *   `speclaw reindex-file -- <abs>` child, then return without waiting, so the
 *   edit is not slowed. This branch never opens the database or loads Compass
 *   (or tree-sitter). With stdin on a terminal it prints usage instead of
 *   blocking.
 *
 * The project root is the working directory (where the hook guard found
 * `.speclaw/index.db`); a payload `cwd` only resolves a relative file path, so
 * a payload cannot redirect writes into another project's index. With no index
 * it does nothing and creates nothing. It prints nothing, is never logged as a
 * Compass call, and swallows every failure (including `SQLITE_BUSY`): the
 * caller always sees exit 0.
 *
 * @param args - Raw arguments after `reindex-file` (`--` honored).
 * @param cwd - Project root (defaults to the process working directory).
 * @param opts - `entry`: the CLI script the detached child runs (defaults to
 *   this process's `argv[1]`); `stdin`: the payload stream (defaults to
 *   `process.stdin`). Both are test seams.
 */
// Covers: req~reindex-on-edit~1
export async function runReindexFile(
  args: readonly string[],
  cwd: string = process.cwd(),
  opts: { entry?: string; stdin?: NodeJS.ReadableStream & { isTTY?: boolean } } = {},
): Promise<void> {
  // Node lines that still flag `node:sqlite` as experimental would print an
  // ExperimentalWarning to stderr; this command must print nothing.
  process.removeAllListeners("warning");
  try {
    const paths = reindexPathArgs(args);
    const hasIndex = (): boolean => fs.existsSync(path.join(cwd, ".speclaw", "index.db"));
    if (paths.length > 0) {
      if (!hasIndex()) return;
      const { indexFiles } = await import("../../modules/compass/indexer.js");
      await indexFiles(cwd, paths);
      return;
    }

    const stdin = opts.stdin ?? process.stdin;
    if (stdin.isTTY) {
      process.stdout.write(helpFor("reindex-file") ?? "");
      return;
    }
    const raw = await readPayload(stdin);
    if (raw === null) return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const target = hookTarget(payload, cwd);
    if (target === null || !hasIndex() || !insideRoot(cwd, target)) return;
    const entry = opts.entry ?? process.argv[1];
    if (!entry) return;
    // detached: its own process group, so neither the hook timeout nor the
    // agent's cleanup of the hook's group kills it. `--` keeps a path that
    // starts with "-" from reading as a flag.
    const child = spawn(process.execPath, [entry, "reindex-file", "--", target], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // A concurrent writer (SQLITE_BUSY after busy_timeout) or any other failure
    // must never fail or print into the agent's edit.
  }
}
