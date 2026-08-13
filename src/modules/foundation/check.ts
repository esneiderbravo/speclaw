import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  CompiledScope,
  Law,
  LawManifest,
  compileScope,
  hasBackend,
  manifestPath,
  matchCompiled,
  readLawManifest,
} from "./laws.js";

// The evaluator behind the `speclaw_check` tool and the `speclaw check` CLI. It
// answers one question — "does this pending or completed action break a law?" —
// on the critical path of every matching tool call, so it must be fast and it
// must fail open: a crashed evaluator returns `allow`, never a block.

/** The hook events speclaw wires; the payload shape differs per event. */
export type CheckEvent = "PreToolUse" | "PostToolUse" | "Stop" | "InstructionsLoaded";

/** ACS-aligned verdict. Claude Code's PreToolUse has no `warn`; it maps to `allow` + message. */
export type Verdict = "allow" | "warn" | "deny" | "escalate";

/** One law evaluated during a check, recorded for auditability. */
export interface EvaluatedLaw {
  lawId: string;
  severity: Law["severity"];
  passed: boolean;
  message?: string;
  file?: string;
}

/** The result of evaluating an action against the project's laws. */
export interface CheckResult {
  verdict: Verdict;
  evaluated: EvaluatedLaw[];
  /** Text returned to the hook; on `deny`, the reason cites id + prose + source. */
  reason?: string;
  /** Milliseconds spent evaluating — a requirement, benchmarked in the suite. */
  elapsedMs: number;
  /** Set when the evaluator failed open (missing/corrupt manifest, exception). */
  diagnostic?: string;
}

/** Arguments accepted by {@link checkAction} and the `speclaw_check` tool. */
export interface CheckArgs {
  projectPath: string;
  event: CheckEvent;
  toolName?: string;
  payload: Record<string, unknown>;
}

/** A law with its scope pre-compiled to regexes — the hot-path unit. */
interface IndexedLaw {
  law: Law;
  scope: CompiledScope;
}

/** A per-project cache of the compiled law index, invalidated by manifest mtime. */
interface CacheEntry {
  mtimeMs: number;
  laws: IndexedLaw[];
}
const cache = new Map<string, CacheEntry>();

/**
 * Load the project's compiled law index, using the in-process cache when the
 * manifest is unchanged (keeps `PreToolUse` off the disk and off the regex
 * compiler on the hot path). Returns null when the manifest is missing or
 * unparseable, so the caller fails open.
 */
function loadLaws(projectPath: string): IndexedLaw[] | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(manifestPath(projectPath)).mtimeMs;
  } catch {
    cache.delete(projectPath);
    return null;
  }
  const hit = cache.get(projectPath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.laws;
  const manifest: LawManifest | null = readLawManifest(projectPath);
  if (!manifest) return null;
  const laws = manifest.laws.map((law) => ({ law, scope: compileScope(law.scope) }));
  cache.set(projectPath, { mtimeMs, laws });
  return laws;
}

/** Clear the manifest cache (used by tests and by a manifest rewrite in-process). */
export function clearLawCache(): void {
  cache.clear();
}

/** POSIX-normalize a path and make it project-relative when it is absolute. */
function toRelPosix(projectPath: string, p: string): string {
  let rel = p;
  if (path.isAbsolute(p)) rel = path.relative(projectPath, p);
  return rel.split(path.sep).join("/").replace(/^\.\//, "");
}

/** Extract the file the action targets from a tool payload, across common shapes. */
function targetPath(projectPath: string, payload: Record<string, unknown>): string | null {
  const input = (payload.tool_input ?? payload.toolInput ?? payload) as Record<string, unknown>;
  const candidate =
    input.file_path ?? input.filePath ?? input.path ?? input.notebook_path ?? input.notebookPath;
  return typeof candidate === "string" ? toRelPosix(projectPath, candidate) : null;
}

/** Extract the instructions file that was loaded, across common payload shapes. */
function loadedFile(projectPath: string, payload: Record<string, unknown>): string | null {
  const candidate = payload.file ?? payload.filePath ?? payload.path ?? payload.file_path;
  return typeof candidate === "string" ? toRelPosix(projectPath, candidate) : null;
}

/** Format the citation for a matched law: id, source, and its literal prose. */
function cite(law: Law): string {
  const at = law.source.line ? `${law.source.file}:${law.source.line}` : law.source.file;
  return `${law.id} (${at}): «${law.prose}»`;
}

/** Append the ids of the laws a just-loaded instructions file declares to the context log. */
function recordContextCoverage(projectPath: string, laws: Law[], file: string | null): string[] {
  const ids = laws.filter((l) => (file ? l.source.file === file : true)).map((l) => l.id);
  if (ids.length === 0) return ids;
  try {
    const logDir = path.join(projectPath, ".speclaw");
    fs.mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({ at: new Date().toISOString(), file, lawIds: ids }) + "\n";
    fs.appendFileSync(path.join(logDir, "context-log.jsonl"), line);
  } catch {
    // Best-effort audit — never let a logging failure affect the verdict.
  }
  return ids;
}

/**
 * Evaluate an agent action against every law whose scope matches its target and
 * return an ACS-aligned verdict. Only the `path` backend is evaluated; laws with
 * another (unimplemented) backend are skipped. The evaluator fails open: a
 * missing or unparseable manifest, or any exception, yields `allow` with a
 * diagnostic — an enforcement layer that blocks when its own checker crashes is
 * worse than none.
 *
 * @param args - The project, hook event, optional tool name, and raw payload.
 * @returns The verdict, the laws evaluated, an optional reason, and `elapsedMs`.
 */
export function checkAction(args: CheckArgs): CheckResult {
  const start = performance.now();
  const done = (r: Omit<CheckResult, "elapsedMs">): CheckResult => ({
    ...r,
    elapsedMs: performance.now() - start,
  });
  try {
    const laws = loadLaws(args.projectPath);
    if (!laws) {
      return done({
        verdict: "allow",
        evaluated: [],
        diagnostic: "law manifest missing or unparseable — failing open",
      });
    }

    if (args.event === "InstructionsLoaded") {
      const ids = recordContextCoverage(
        args.projectPath,
        laws.map((il) => il.law),
        loadedFile(args.projectPath, args.payload),
      );
      return done({
        verdict: "allow",
        evaluated: ids.map((id) => ({ lawId: id, severity: "info", passed: true })),
      });
    }

    const target = targetPath(args.projectPath, args.payload);
    if (target === null) return done({ verdict: "allow", evaluated: [] });

    const matched = laws
      .filter((il) => hasBackend(il.law) && matchCompiled(il.scope, target))
      .map((il) => il.law);
    const evaluated: EvaluatedLaw[] = matched.map((l) => ({
      lawId: l.id,
      severity: l.severity,
      passed: l.enforcement !== "bloqueo" || args.event !== "PreToolUse",
      message: cite(l),
      file: target,
    }));

    // Only a `bloqueo` law, and only on PreToolUse, stops the keystroke. Every
    // other match still enters context as a message the agent reads.
    const blocking =
      args.event === "PreToolUse" ? matched.filter((l) => l.enforcement === "bloqueo") : [];
    if (blocking.length > 0) {
      return done({
        verdict: "deny",
        evaluated,
        reason: `Blocked by ${blocking.map(cite).join("; ")}`,
      });
    }

    const messages = evaluated.map((e) => e.message).filter(Boolean) as string[];
    return done({
      verdict: "allow",
      evaluated,
      reason: messages.length ? messages.join("; ") : undefined,
    });
  } catch (err) {
    return done({
      verdict: "allow",
      evaluated: [],
      diagnostic: `check failed open: ${(err as Error).message}`,
    });
  }
}
