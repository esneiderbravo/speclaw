import { z } from "zod";
import { specInit, specValidate, specSync, specArchive, specList } from "./engine.js";
import { handleLevel } from "./quick.js";
import { buildCoverageReport, loadCoverageConfig, renderCoverageAgent } from "./coverage.js";
import { buildDriftReport, renderDriftAgent } from "./drift.js";

export const lawbookChangeActions = [
  "init",
  "list",
  "validate",
  "sync",
  "archive",
  "level",
  "coverage",
  "drift",
] as const;

export type LawbookChangeAction = (typeof lawbookChangeActions)[number];

export const lawbookChangeSchema = {
  projectPath: z.string(),
  action: z.enum(lawbookChangeActions),
  change: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  mode: z.enum(["propose", "set", "promote", "explain"]).optional(),
  paths: z.array(z.string()).optional(),
  symbols: z.array(z.string()).optional(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  reason: z.string().optional(),
  onlyDefects: z.boolean().optional(),
  json: z.boolean().optional(),
  capability: z.string().optional(),
  includeReverse: z.boolean().optional(),
  maxItems: z.number().int().min(1).max(50).optional(),
};

type ChangeArgs = {
  projectPath: string;
  action: LawbookChangeAction;
  change?: string;
  date?: string;
  mode?: "propose" | "set" | "promote" | "explain";
  paths?: string[];
  symbols?: string[];
  level?: 0 | 1 | 2 | 3;
  reason?: string;
  onlyDefects?: boolean;
  json?: boolean;
  capability?: string;
  includeReverse?: boolean;
  maxItems?: number;
};

function requireField(args: ChangeArgs, field: keyof ChangeArgs): string {
  const v = args[field];
  if (typeof v === "string" && v.length > 0) return v;
  throw new Error(`lawbook_change: action '${args.action}' requires '${String(field)}'`);
}

/**
 * Dispatch `lawbook_change` by action.
 *
 * @param args - Unified lawbook lifecycle arguments.
 */
export function handleLawbookChange(args: ChangeArgs): unknown {
  switch (args.action) {
    case "init":
      return specInit(args.projectPath);
    case "list":
      return specList(args.projectPath);
    case "validate":
      return specValidate(args.projectPath, requireField(args, "change"));
    case "sync":
      return specSync(args.projectPath, requireField(args, "change"));
    case "archive":
      return specArchive(
        args.projectPath,
        requireField(args, "change"),
        requireField(args, "date"),
      );
    case "level":
      if (!args.mode) throw new Error(`lawbook_change: action 'level' requires 'mode'`);
      return handleLevel({
        projectPath: args.projectPath,
        mode: args.mode,
        change: args.change,
        paths: args.paths,
        symbols: args.symbols,
        level: args.level,
        reason: args.reason,
      });
    case "coverage": {
      const cfg = loadCoverageConfig(args.projectPath);
      const report = buildCoverageReport(args.projectPath, { change: args.change, cfg });
      if (args.json) return report;
      return renderCoverageAgent(report, args.onlyDefects !== false);
    }
    case "drift": {
      const report = buildDriftReport(args.projectPath, {
        capability: args.capability,
        reverse: args.includeReverse === true,
        failOn: "semantic",
      });
      if (args.json) return report;
      return renderDriftAgent(report, args.maxItems ?? 10);
    }
    default:
      throw new Error(`lawbook_change: unknown action '${String(args.action)}'`);
  }
}
