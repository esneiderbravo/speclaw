import { z } from "zod";
import { specInit, specValidate, specSync, specArchive, specList } from "./engine.js";
import { handleLevel } from "./quick.js";
import { shipChange } from "./ship.js";
import { scaffoldBugfix } from "./bugfix.js";
import { scaffoldFeature } from "./scaffold-change.js";
import { buildCoverageReport, loadCoverageConfig, renderCoverageAgent } from "./coverage.js";
import { buildDriftReport, renderDriftAgent } from "./drift.js";
import { handleHarness, harnessOps } from "../cortex/harness.js";
import { fitStatusResult } from "../cortex/status.js";

export const lawbookChangeActions = [
  "init",
  "list",
  "draft",
  "validate",
  "sync",
  "archive",
  "level",
  "coverage",
  "drift",
  "harness",
  "ship",
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
  harnessOp: z.enum(harnessOps).optional(),
  verdict: z.enum(["PASS", "FAIL"]).optional(),
  openQuestions: z.array(z.string()).optional(),
  pauseForQuestions: z.boolean().optional(),
  note: z.string().optional(),
  bug: z.boolean().optional(),
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
  harnessOp?: (typeof harnessOps)[number];
  verdict?: "PASS" | "FAIL";
  openQuestions?: string[];
  pauseForQuestions?: boolean;
  note?: string;
  bug?: boolean;
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
    case "draft": {
      // Covers: req~feature-draft~1
      const name = requireField(args, "change");
      if (args.bug) return scaffoldBugfix(args.projectPath, name, { level: args.level });
      return scaffoldFeature(args.projectPath, name, {
        level: args.level,
        reason: args.reason,
        capability: args.capability,
      });
    }
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
    case "ship":
      return shipChange(args.projectPath, requireField(args, "change"), {
        summary: args.note,
        date: args.date,
      });
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
    case "harness": {
      // Deprecated alias — prefer MCP tool `cortex` / `speclaw cortex`.
      if (!args.harnessOp) {
        throw new Error(`lawbook_change: action 'harness' requires 'harnessOp'`);
      }
      const result = handleHarness({
        projectPath: args.projectPath,
        change: requireField(args, "change"),
        harnessOp: args.harnessOp,
        verdict: args.verdict ?? null,
        openQuestions: args.openQuestions,
        pauseForQuestions: args.pauseForQuestions,
        note: args.note ?? args.reason,
      });
      // MCP-only path: fit `status` to the output budget like the `cortex` tool.
      return args.harnessOp === "status" && "summary" in result ? fitStatusResult(result) : result;
    }
    default:
      throw new Error(`lawbook_change: unknown action '${String(args.action)}'`);
  }
}
