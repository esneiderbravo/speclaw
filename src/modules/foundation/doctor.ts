import fs from "node:fs";
import path from "node:path";
import { AGENTS, detectConfiguredAgents } from "../../shared/agents.js";

/** A single health-check line with a pass/fail verdict and remediation hint. */
interface Check {
  name: string;
  ok: boolean;
  /** Human-readable status or "missing — <how to fix>" guidance. */
  detail: string;
}

/**
 * Run the speclaw installation health checks against a project: ai-specs and
 * LAWS.md presence, agent contracts, the docs/standards set, per-agent IDE
 * symlink health, the spec/ workflow, the Compass index, and .mcp.json wiring.
 *
 * @param projectPath - Absolute path to the project root.
 * @returns One {@link Check} per verified item, each carrying a remediation hint.
 */
export function doctor(projectPath: string): Check[] {
  const checks: Check[] = [];
  const has = (rel: string) => fs.existsSync(path.join(projectPath, rel));

  checks.push({
    name: "ai-specs directory",
    ok: has("ai-specs"),
    detail: has("ai-specs")
      ? "present"
      : "missing — run the scaffold tool first",
  });

  checks.push({
    name: "LAWS.md constitution",
    ok: has("LAWS.md"),
    detail: has("LAWS.md") ? "present" : "missing — the project has no law",
  });

  for (const entry of ["CLAUDE.md", "AGENTS.md", "docs/compass.md"]) {
    checks.push({
      name: `${entry} agent contract`,
      ok: has(entry),
      detail: has(entry) ? "present" : "missing — scaffold writes it",
    });
  }

  const standards = [
    "base-standards",
    "architecture",
    "backend-standards",
    "frontend-standards",
    "testing-standards",
    "documentation",
    "conventions",
    "spec-workflow",
  ];
  const missingStandards = standards.filter(
    (s) => !has(path.join("docs/standards", `${s}.md`))
  );
  checks.push({
    name: "docs/standards/*",
    ok: missingStandards.length === 0,
    detail: missingStandards.length === 0
      ? `all ${standards.length} standards present`
      : `missing: ${missingStandards.join(", ")}`,
  });

  // Only check the agents the user actually configured — selection is opt-in.
  const configured = AGENTS.filter((a) => detectConfiguredAgents(projectPath).includes(a.id));
  if (configured.length === 0) {
    checks.push({
      name: "agents",
      ok: false,
      detail: "none configured — run `speclaw init` or `speclaw agent add <id>`",
    });
  }
  for (const agent of configured) {
    for (const target of agent.linkTargets) {
      // only demand links for content that actually exists in ai-specs/
      if (!has(path.join("ai-specs", target))) continue;
      const ideDir = agent.ideDir;
      const linkPath = path.join(projectPath, ideDir, target);
      let ok = false;
      let detail = "missing";
      try {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
          ok = fs.existsSync(linkPath); // broken symlink -> false
          detail = ok ? `-> ${fs.readlinkSync(linkPath)}` : "broken symlink";
        } else {
          ok = true;
          detail = "real directory (not a symlink — consider migrating to ai-specs)";
        }
      } catch {
        // stays missing
      }
      checks.push({ name: `${ideDir}/${target}`, ok, detail });
    }
  }

  checks.push({
    name: "spec workflow",
    ok: has("spec"),
    detail: has("spec")
      ? "spec/ present"
      : "missing — run the `spec_init` tool",
  });

  checks.push({
    name: "Compass index",
    ok: has(".speclaw/index.db"),
    detail: has(".speclaw/index.db")
      ? ".speclaw/index.db present"
      : "missing — run the `compass_index` tool",
  });

  checks.push({
    name: ".mcp.json wiring",
    ok: has(".mcp.json"),
    detail: has(".mcp.json") ? "present" : "missing — scaffold writes it",
  });

  return checks;
}
