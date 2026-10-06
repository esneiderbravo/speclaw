import { buildIndex } from "../../modules/compass/indexer.js";
import { startWatch } from "../../modules/compass/watcher.js";
import { recordCompassCall } from "../../shared/compass-calls.js";
import { Flags } from "../lib/args.js";
import { ui, renderProgress, clearProgress } from "../lib/ui.js";

/** (Re)build the Compass code graph for the cwd, showing progress and final stats. */
export async function runIndex(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  recordCompassCall(cwd, "compass_index");
  const json = Boolean(flags.json);
  if (!json) ui.step("Indexing with Compass");
  const start = Date.now();
  const stats = await buildIndex(cwd, {
    force: Boolean(flags.force),
    prune: Boolean(flags.prune),
    maxCacheMB: flags["max-cache-mb"] ? Number(flags["max-cache-mb"]) : undefined,
    retentionDays: flags.retention ? Number(flags.retention) : undefined,
    onProgress: json ? undefined : (e) => renderProgress(e.done, e.total, e.file),
  });
  if (json) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
    return;
  }
  clearProgress();
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  const root = stats.rootUnchanged ? " · root unchanged" : "";
  ui.ok(
    `${stats.files} files · ${stats.nodes} nodes · ${stats.edges} edges · ` +
      `${stats.computed} computed · ${stats.fromCache} fromCache · ` +
      `${stats.unchanged} unchanged · ${stats.skippedByStat} skippedByStat` +
      `${root}  (${secs}s)`,
  );
  const t = stats.totals;
  ui.info(`Totals: ${t.files} files · ${t.nodes} nodes · ${t.edges} edges`);
  ui.info(stats.nextStep);
}

/** Build the initial index, then watch for file changes to keep it fresh. */
export async function runWatch(_flags: Flags): Promise<void> {
  const cwd = process.cwd();
  ui.step("Building initial index");
  await buildIndex(cwd);
  const status = startWatch(cwd);
  ui.ok(`Watching for changes (${status.mode}). Press Ctrl+C to stop.`);
  // keep the process alive
  await new Promise<void>(() => {});
}
