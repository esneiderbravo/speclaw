import fs from "node:fs";
import path from "node:path";
import * as clack from "@clack/prompts";
import { scaffold, Profile } from "../../modules/foundation/scaffold.js";
import { specInit } from "../../modules/lawbook/engine.js";
import { buildIndex } from "../../modules/compass/indexer.js";
import { AGENTS, agentById } from "../../shared/agents.js";
import { loadPacks } from "../../modules/tools/packs.js";
import { Flags, list } from "../lib/args.js";
import { ui, c, banner, renderProgress, clearProgress } from "../lib/ui.js";

const PACK_LABELS: Record<string, string> = {
  agents: "dev-agents (backend · frontend · product)",
};

function detectProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    if (pkg.name) return String(pkg.name).replace(/^@[^/]+\//, "");
  } catch {
    /* ignore */
  }
  return path.basename(cwd);
}

/**
 * Interactive setup: pick agents and packs, scaffold, index, and print the handoff prompt.
 *
 * @param flags - Parsed flags; runs interactively on a TTY unless `--agents`, `--yes`, or
 *   `-y` is set. Honors `--project-name`, `--ticket-prefix`, `--team-language`, `--packs`,
 *   and `--no-index`.
 */
export async function runInit(flags: Flags): Promise<void> {
  const cwd = process.cwd();
  const projectName = (flags["project-name"] as string) || detectProjectName(cwd);
  const interactive =
    Boolean(process.stdin.isTTY) && !flags.agents && !flags.yes && !flags.y;

  let agents: string[];
  let packs: string[];
  let ticketPrefix: string | undefined = flags["ticket-prefix"] as string | undefined;
  let teamLanguage: string | undefined = flags["team-language"] as string | undefined;

  banner();

  if (interactive) {
    const answers = await clack.group(
      {
        agents: () =>
          clack.multiselect({
            message: "Which agents do you use? (space to select)",
            options: AGENTS.map((a) => ({ value: a.id, label: a.label })),
            initialValues: ["claude"],
            required: true,
          }),
        packs: () =>
          clack.multiselect({
            message: "Which tool packs to install?",
            options: Object.entries(loadPacks()).map(([id, def]) => ({
              value: id,
              label: id,
              hint: def.description.slice(0, 50),
            })),
            initialValues: ["agents"],
            required: false,
          }),
        ticketPrefix: () =>
          clack.text({ message: "Ticket prefix (optional, e.g. FAR)", defaultValue: "" }),
        teamLanguage: () =>
          clack.text({ message: "Team communication language", defaultValue: "English" }),
      },
      { onCancel: () => process.exit(1) }
    );
    agents = answers.agents as string[];
    packs = answers.packs as string[];
    ticketPrefix = (answers.ticketPrefix as string) || undefined;
    teamLanguage = (answers.teamLanguage as string) || undefined;
  } else {
    agents = list(flags.agents).length ? list(flags.agents) : ["claude"];
    packs = list(flags.packs).length ? list(flags.packs) : ["agents"];
  }

  const unknownAgents = agents.filter((a) => !agentById(a));
  if (unknownAgents.length) {
    ui.err(`Unknown agent(s): ${unknownAgents.join(", ")}. Known: ${AGENTS.map((a) => a.id).join(", ")}`);
    process.exit(1);
  }

  const profile: Profile = {
    project_name: projectName,
    ...(ticketPrefix ? { ticket_prefix: ticketPrefix } : {}),
    ...(teamLanguage ? { team_language: teamLanguage } : {}),
  };

  // 1. Content + chosen agents, with a check per piece installed
  ui.step(`Setting up ${c.bold(c.cyan(projectName))}`);
  scaffold(cwd, profile, packs, agents);
  ui.ok(`Foundation ${c.muted("— LAWS.md + 8 standards + CLAUDE.md/AGENTS.md")}`);
  ui.ok(`Lawbook workflow ${c.muted("— draft · build · sync · archive · explore")}`);
  for (const p of packs) ui.ok(`${PACK_LABELS[p] ?? p + " pack"}`);
  specInit(cwd);
  ui.ok(`Lawbook workspace ${c.muted("— lawbook/")}`);

  ui.step("Configuring agents");
  for (const id of agents) ui.ok(`${agentById(id)!.label} ${c.muted("— symlinks + MCP")}`);

  // 2. Compass index with progress
  if (!flags["no-index"]) {
    ui.step("Indexing your code with Compass");
    const stats = await buildIndex(cwd, (e) => renderProgress(e.done, e.total, e.file));
    clearProgress();
    ui.ok(
      c.bold(c.cream(String(stats.files))) + c.muted(" files · ") +
        c.bold(c.cream(String(stats.nodes))) + c.muted(" nodes · ") +
        c.bold(c.cream(String(stats.edges))) + c.muted(" edges · ") +
        c.bold(c.cream(String(stats.embeddings))) + c.muted(" embeddings")
    );
  }

  // 3. Handoff prompt for the chosen agent — printed as a single flush-left
  // line so it copy-pastes cleanly (no borders, no wrapping artifacts).
  const primary = agentById(agents[0]!)!;
  ui.step("You're set — one last step");
  ui.plain();
  ui.info(`Copy this and paste it into ${c.cyan(primary.label)}:`);
  ui.plain();
  console.log(
    c.cream(
      "Complete speclaw's foundation: analyze this repo and fill LAWS.md and " +
        "docs/standards/* with its real architecture, quality gates and conventions. " +
        "Start with init_project."
    )
  );
  ui.plain();
  ui.info(`The dev-agents read those standards for your stack — filling them well makes them stack-aware.`);
  ui.plain();
  ui.info(`Add an agent:   ${ui.code("speclaw agent add cursor")}`);
  ui.info(`Refresh index:  ${ui.code("speclaw index")}`);
  ui.info(`Health check:   ${ui.code("speclaw doctor")}`);
  ui.plain();
}
