import { explore, search, recall, impact, trace } from "../../modules/compass/query.js";
import { affectedTests } from "../../modules/compass/affected.js";
import { hotspots, coupling } from "../../modules/compass/hotspots.js";
import { diffContext, formatDiffContext } from "../../modules/compass/diff-context.js";
import { Flags, list } from "../lib/args.js";
import { ui } from "../lib/ui.js";

/**
 * Run a Compass query from the shell — the same surface agents call via MCP.
 *
 * @param cmd - Query verb: `explore`, `search`, `recall`, `impact`, `trace`,
 *   `affected-tests`, `hotspots`, or `coupling`.
 * @param flags - Parsed flags supplying positional args and options in `_`.
 * @throws Exits the process with code 1 on missing arguments or query errors.
 */
export async function runQuery(cmd: string, flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const args = flags._;
  const asJson = Boolean(flags.json);
  try {
    switch (cmd) {
      case "explore": {
        const r = explore(cwd, need(args[0], "explore <node>"));
        if (!r.found) {
          ui.warn(r.message ?? "not found");
          r.otherMatches?.forEach((m) => ui.info(`${m.name} (${m.kind}) ${m.file}:${m.line}`));
          return;
        }
        const s = r.symbol!;
        ui.heading(`${s.kind} ${s.name}  ${s.file}:${s.startLine}-${s.endLine}`);
        console.log(s.source);
        ui.heading("Callees");
        r.callees?.forEach((c) => ui.info(`${c.name}${c.file ? ` (${c.file}:${c.line})` : ""}`));
        ui.heading("Callers");
        r.callers?.forEach((c) => ui.info(`${c.name} (${c.file}:${c.line})`));
        return;
      }
      case "search": {
        const hits = search(cwd, need(args[0], "search <query>"));
        ui.heading(`${hits.length} result(s)`);
        hits.forEach((h) => ui.info(`${h.name} (${h.kind}) ${h.file}:${h.line}`));
        return;
      }
      case "recall": {
        const hits = await recall(cwd, need(args[0], 'recall "<query>"'));
        ui.heading(`${hits.length} result(s) by meaning`);
        hits.forEach((h) =>
          ui.info(`${h.score.toFixed(3)}  ${h.name} (${h.kind}) ${h.file}:${h.line}`),
        );
        return;
      }
      case "impact": {
        const fileList = list(flags.file);
        if (!args[0] && fileList.length === 0) {
          need(undefined, "impact <node> | impact --file <path>");
        }
        const format = flags.flat ? "flat" : "grouped";
        const result = impact(cwd, {
          symbol: args[0],
          files: fileList.length ? fileList : undefined,
          maxDepth: flags.depth ? Number(flags.depth) : 4,
          format,
          target: typeof flags.target === "string" ? (flags.target as "any") : "any",
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.global) {
          ui.heading(`Blast radius: repo-wide`);
          ui.warn(result.global.reason);
          result.warnings.forEach((w) => ui.warn(w));
          return;
        }
        ui.heading(
          `Blast radius: ${result.totals.nodes} node(s) in ${result.totals.modules} module(s)` +
            (result.limits.truncated ? " (truncated)" : ""),
        );
        if (result.target.kind === "symbol" && result.target.definitions.length > 1) {
          ui.warn(
            `"${result.target.symbol}" is defined in ${result.target.definitions.length} places; impact is the union`,
          );
        }
        if (format === "flat" && result.nodes) {
          result.nodes.forEach((n) =>
            ui.info(`depth ${n.depth} [${n.resolution}]: ${n.name} (${n.file}:${n.line})`),
          );
        } else {
          for (const m of result.modules) {
            ui.heading(
              `${m.module} — ${m.nodes} node(s), ${m.files} file(s), min depth ${m.minDepth}`,
            );
            m.top.forEach((n) =>
              ui.info(`depth ${n.depth} [${n.resolution}]: ${n.name} (${n.file}:${n.line})`),
            );
          }
        }
        if (result.resolution.byName > 0) {
          ui.warn(`${result.resolution.byName} result(s) resolved by name (possible collisions)`);
        }
        result.warnings.forEach((w) => ui.warn(w));
        return;
      }
      case "affected-tests": {
        const files = list(flags.file);
        const fromDiff =
          typeof flags["from-diff"] === "string"
            ? flags["from-diff"]
            : flags["from-diff"] === true
              ? "HEAD"
              : undefined;
        if (files.length === 0 && !fromDiff && !args[0]) {
          need(undefined, "affected-tests --file <path> | --from-diff <ref>");
        }
        const result = affectedTests(cwd, {
          files: files.length ? files : undefined,
          symbols: args[0] ? [args[0]] : undefined,
          fromDiff,
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        ui.heading(
          `Affected tests (${result.mode}): ${result.tests.length} file(s) — skipped ${result.skipped.files} (${result.skipped.percent}%)`,
        );
        ui.info(result.reason);
        result.tests.forEach((t) => ui.info(t.file));
        ui.heading("Command");
        console.log(result.command);
        result.warnings.forEach((w) => ui.warn(w));
        return;
      }
      case "hotspots": {
        const sortRaw = typeof flags.sort === "string" ? flags.sort : undefined;
        const sortBy =
          sortRaw === "churn" || sortRaw === "complexity" || sortRaw === "combined"
            ? sortRaw
            : "combined";
        const result = hotspots(cwd, {
          days: flags.days ? Number(flags.days) : undefined,
          since: typeof flags.since === "string" ? flags.since : undefined,
          sortBy,
          limit: flags.limit ? Number(flags.limit) : undefined,
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        ui.heading(
          `Hotspots (${result.window.label}, sort=${result.sortBy}): ${result.hotspots.length}`,
        );
        for (const h of result.hotspots) {
          const health = h.health
            ? `branches=${h.health.worstBranches} nest=${h.health.worstNesting} loc=${h.health.worstLoc}`
            : "health=n/a";
          ui.info(
            `${h.file}  commits=${h.activity.commits} authors=${h.activity.authors}  ${health}`,
          );
        }
        result.warnings.forEach((w) => ui.warn(w));
        return;
      }
      case "coupling": {
        const file = need(args[0], "coupling <file>");
        const result = coupling(cwd, file, {
          days: flags.days ? Number(flags.days) : undefined,
          since: typeof flags.since === "string" ? flags.since : undefined,
          minShared: flags["min-shared"] ? Number(flags["min-shared"]) : undefined,
          maxFilesPerCommit: flags["max-files"] ? Number(flags["max-files"]) : undefined,
          limit: flags.limit ? Number(flags.limit) : undefined,
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        ui.heading(
          `Coupling for ${result.file} (${result.window.label}): ${result.partners.length} partner(s)`,
        );
        ui.info(
          `scanned=${result.diagnostics.commitsScanned} skippedTooLarge=${result.diagnostics.skippedTooLarge}`,
        );
        for (const p of result.partners) {
          ui.info(
            `${p.file}  both=${p.both} strength=${p.strength.toFixed(3)} in_graph=${p.inGraph} isTestPair=${p.isTestPair}`,
          );
        }
        result.warnings.forEach((w) => ui.warn(w));
        return;
      }
      case "diff-context": {
        const files = list(flags.file);
        const rev = typeof flags.rev === "string" ? flags.rev : undefined;
        if (files.length === 0 && !rev && !flags.worktree) {
          need(undefined, "diff-context [--file <path>...] [--rev <ref>] [--worktree]");
        }
        const result = diffContext({
          projectPath: cwd,
          rev: flags.worktree ? "WORKTREE" : rev,
          paths: files.length ? files : undefined,
          mode: flags.full ? "full" : "brief",
        });
        if (asJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(formatDiffContext(result));
        return;
      }
      case "trace": {
        const r = trace(
          cwd,
          need(args[0], "trace <from> <to>"),
          need(args[1], "trace <from> <to>"),
        );
        ui.heading(`Trace ${r.from} → ${r.to}`);
        console.log(r.path ? "  " + r.path.join(" → ") + `  (${r.hops} hops)` : "  no path found");
        return;
      }
    }
  } catch (err) {
    ui.err((err as Error).message);
    process.exit(1);
  }
}

/** Return the value or print a usage error and exit if it is missing. */
function need(value: string | undefined, usage: string): string {
  if (!value) {
    ui.err(`Usage: speclaw ${usage}`);
    process.exit(1);
  }
  return value;
}
