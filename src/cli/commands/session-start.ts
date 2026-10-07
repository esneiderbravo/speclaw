import fs from "node:fs";
import path from "node:path";

/**
 * `speclaw session-start`: refresh an existing Compass index incrementally,
 * print nothing, and never fail. It is a top-level command rather than an
 * `index` flag so an older speclaw that resolves first rejects it as unknown
 * before indexing anything. With no `.speclaw/index.db` it returns at once,
 * before `node:sqlite` is even loaded — the first build stays an explicit
 * `speclaw index` / `compass_index`. It is not logged as a Compass call: the
 * hook would otherwise append an entry per session and rotate real evidence out.
 *
 * @param cwd - Project root (defaults to the process working directory).
 */
// Covers: req~session-start-index~1
export async function runSessionStart(cwd: string = process.cwd()): Promise<void> {
  try {
    if (!fs.existsSync(path.join(cwd, ".speclaw", "index.db"))) return;
    // Node lines that still flag `node:sqlite` as experimental would print an
    // ExperimentalWarning to stderr; this command must print nothing.
    process.removeAllListeners("warning");
    const { buildIndex } = await import("../../modules/compass/indexer.js");
    await buildIndex(cwd, {});
  } catch {
    // A concurrent writer (SQLITE_BUSY after busy_timeout) or any other failure
    // must never fail or print into a starting session.
  }
}
