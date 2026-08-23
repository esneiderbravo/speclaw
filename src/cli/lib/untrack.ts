import { ui, c } from "./ui.js";
import { listTrackedPaths } from "../../shared/git.js";

/**
 * If `ai-specs/` is still tracked by git, print the exact `git rm -r --cached`
 * command to untrack it. `ai-specs/` is regenerable from the package, so
 * init/update gitignore it — but adding a `.gitignore` entry does not stop git
 * tracking a directory it already tracks, so this is how an already-installed
 * project makes that content local. It only prints — it never modifies the git
 * index — and no-ops silently outside a git repository or when nothing is
 * tracked. The agents' IDE directories (`.claude/`, …) are deliberately left
 * alone, so a user's own skills/commands there stay committable.
 *
 * @param projectPath - Project root to inspect and address.
 */
// Covers: req~agent-ide-committable~1, req~ai-specs-untrack-hint~1
export function reportTrackedLocalContent(projectPath: string): void {
  const tracked = listTrackedPaths(projectPath, ["ai-specs"]);
  if (!tracked.length) return;

  ui.step("Make ai-specs/ local-only");
  ui.info("git still tracks ai-specs/ (regenerable). To stop tracking it (it stays on disk):");
  ui.plain();
  console.log("  " + c.cream(`git rm -r --cached ${tracked.join(" ")}`));
  console.log("  " + c.cream('git commit -m "chore: stop tracking speclaw local content"'));
  ui.plain();
}
