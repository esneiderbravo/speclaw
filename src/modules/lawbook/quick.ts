import {
  gatherSignals,
  loadCeremonyConfig,
  promoteCeremonyLevel,
  proposeLevel,
  setCeremonyLevel,
  type CeremonyProposal,
  type CeremonyRecord,
  type CeremonyTargets,
} from "./levels.js";
import { scaffoldChange } from "./scaffold-change.js";

/**
 * Scaffold a level-0 change: `record.md`, `change.json`, and `reports/`.
 *
 * @param projectPath - Project root with `lawbook/`.
 * @param name - Change folder name (kebab-case).
 * @param targets - Optional paths/symbols used to propose the level (default empty → score 0).
 */
export function scaffoldQuick(
  projectPath: string,
  name: string,
  targets: CeremonyTargets = { paths: [], symbols: [] },
): { change: string; proposal: CeremonyProposal; record: CeremonyRecord; dir: string } {
  // quick always records level 0; if measurement says higher, still allow but note it.
  const quickRationale = (proposal: CeremonyProposal): string =>
    proposal.level === null
      ? proposal.rationale
      : proposal.level > 0
        ? `${proposal.rationale} — quick forced level 0; promote if scope grows`
        : proposal.rationale;
  const r = scaffoldChange(projectPath, name, {
    targets,
    level: 0,
    recordProposal: (proposal) => ({ ...proposal, rationale: quickRationale(proposal) }),
    reason: (proposal) =>
      proposal.level !== null && proposal.level > 0 ? "speclaw quick" : undefined,
    reportsReadme: `# Reports — ${name}\n\nAdd at least one discipline report before archive.\n`,
    artifacts: ({ proposal }) => ({
      "record.md": `# ${name}

**Level:** 0 (proposed: ${proposal.level ?? "n/a"}, confirmed by: human)
**Why:** ${quickRationale(proposal)}

## What changes

<!-- 2–5 lines: what and why. -->

## Steps

- [ ] Make the fix
- [ ] Add or update a regression test
- [ ] Record evidence under reports/

## Evidence

- \`reports/\` — add a discipline report before archive
`,
    }),
  });
  return { change: r.change, proposal: r.proposal, record: r.record as CeremonyRecord, dir: r.dir };
}

/**
 * Handle `lawbook_level` modes: propose / set / promote / explain.
 */
export function handleLevel(args: {
  projectPath: string;
  mode: "propose" | "set" | "promote" | "explain";
  change?: string;
  paths?: string[];
  symbols?: string[];
  level?: 0 | 1 | 2 | 3;
  reason?: string;
}): unknown {
  const targets: CeremonyTargets = {
    paths: args.paths ?? [],
    symbols: args.symbols ?? [],
  };
  const { thresholds } = loadCeremonyConfig(args.projectPath);
  const signals = gatherSignals(args.projectPath, targets, thresholds);
  const proposal = proposeLevel(signals, thresholds);

  if (args.mode === "propose" || args.mode === "explain") {
    return { mode: args.mode, proposal };
  }
  if (!args.change) throw new Error(`mode '${args.mode}' requires 'change'`);
  if (args.mode === "set") {
    if (args.level === undefined) throw new Error("mode 'set' requires 'level'");
    return setCeremonyLevel(args.projectPath, args.change, {
      proposal,
      level: args.level,
      confirmedBy: "human",
      reason: args.reason,
    });
  }
  // promote
  if (args.level === undefined) throw new Error("mode 'promote' requires 'level'");
  return promoteCeremonyLevel(
    args.projectPath,
    args.change,
    args.level,
    args.reason ?? "scope grew",
  );
}
