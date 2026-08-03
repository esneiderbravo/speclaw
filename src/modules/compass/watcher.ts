import fs from "node:fs";
import path from "node:path";
import { buildIndex } from "./indexer.js";

interface WatchState {
  watchers: fs.FSWatcher[];
  reindexes: number;
  timer: NodeJS.Timeout | null;
  recursive: boolean;
}

const active = new Map<string, WatchState>();

const SKIP = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".speclaw",
  "__pycache__",
  ".venv",
  "venv",
  ".mypy_cache",
  ".pytest_cache",
]);

function scheduleReindex(projectPath: string, state: WatchState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    buildIndex(projectPath)
      .then(() => {
        state.reindexes++;
      })
      .catch(() => {
        /* best-effort: a transient parse/read error must not crash the server */
      });
  }, 400);
}

function watchDirsRecursively(projectPath: string, state: WatchState): void {
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    state.watchers.push(fs.watch(dir, () => scheduleReindex(projectPath, state)));
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name)) walk(path.join(dir, e.name));
    }
  };
  walk(projectPath);
}

/** Current state of a project's file watcher. */
export interface WatchStatus {
  watching: boolean;
  reindexes: number;
  mode: "recursive" | "per-directory" | null;
}

/**
 * Start watching the project; changes trigger a debounced incremental reindex.
 *
 * Prefers a single recursive watch (macOS/Windows) and falls back to watching
 * each directory individually where recursive watching is unsupported (Linux).
 * Idempotent: if already watching, returns the current status without starting
 * a second watcher.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns The watcher status after starting.
 */
export function startWatch(projectPath: string): WatchStatus {
  if (active.has(projectPath)) return watchStatus(projectPath);
  const state: WatchState = { watchers: [], reindexes: 0, timer: null, recursive: false };
  try {
    // Recursive watch is supported on macOS and Windows.
    state.watchers.push(
      fs.watch(projectPath, { recursive: true }, () => scheduleReindex(projectPath, state)),
    );
    state.recursive = true;
  } catch {
    // Linux and others: watch each directory individually.
    watchDirsRecursively(projectPath, state);
  }
  active.set(projectPath, state);
  return watchStatus(projectPath);
}

/**
 * Stop watching the project, closing all watchers and cancelling any pending
 * reindex. Safe to call when not watching.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns A status reflecting the stopped watcher (preserving the reindex count).
 */
export function stopWatch(projectPath: string): WatchStatus {
  const state = active.get(projectPath);
  if (state) {
    if (state.timer) clearTimeout(state.timer);
    for (const w of state.watchers) w.close();
    active.delete(projectPath);
  }
  return { watching: false, reindexes: state?.reindexes ?? 0, mode: null };
}

/** Report whether the project is being watched, and in which mode. */
export function watchStatus(projectPath: string): WatchStatus {
  const state = active.get(projectPath);
  if (!state) return { watching: false, reindexes: 0, mode: null };
  return {
    watching: true,
    reindexes: state.reindexes,
    mode: state.recursive ? "recursive" : "per-directory",
  };
}
