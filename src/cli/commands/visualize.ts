import { spawn } from "node:child_process";
import { visualize } from "../../modules/compass/visualize.js";
import { Flags } from "../lib/args.js";
import { ui, c } from "../lib/ui.js";

/** Open a file in the OS default application (browser for .html). */
function openInBrowser(file: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [file], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    /* best-effort */
  }
}

/**
 * Build an interactive HTML visualization of the Compass graph into
 * .speclaw/graph.html and open it.
 *
 * @param flags - `_[0]` optionally focuses on a node; `--depth`, `--limit`, `--no-open`.
 * @throws Exits the process with code 1 if the index is missing or generation fails.
 */
export async function runVisualize(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const focus = flags._[0];
  try {
    const r = visualize(cwd, {
      focus,
      depth: flags.depth ? Number(flags.depth) : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
    });
    ui.step("Compass graph");
    ui.ok(
      c.bold(c.cream(String(r.shown))) + c.muted(" nodes · ") +
        c.bold(c.cream(String(r.links))) + c.muted(" edges") +
        (focus ? c.muted(` · focused on ${focus}`) : c.muted(` · top of ${r.total}`))
    );
    ui.info(`→ ${ui.code(".speclaw/graph.html")}`);
    if (!flags["no-open"]) {
      openInBrowser(r.path);
      ui.info("Opening in your browser…");
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}
