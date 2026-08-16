import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { assetsDir } from "../../shared/paths.js";

// The machine-readable law model and its manifest. This is the contract seam
// (`.speclaw/laws-manifest.json`) between where laws come from and how they are
// enforced: check-dispatcher owns the schema and the single `path` verification
// backend; executable-laws extends the same model with `ast`/`deps`/`process`
// backends by filling in more `verification.kind` cases — it never rewrites it.

const ASSETS = assetsDir(import.meta.url);

/** Severity of a law violation, mirrored into the check verdict. */
export type Severity = "error" | "warn" | "info";

/**
 * How a violation is punished — maps to the hook event a law compiles to.
 * A new law defaults to `feedback`; only `bloqueo` stops the keystroke.
 */
export type Enforcement =
  | "bloqueo" // PreToolUse — the action is denied before it happens
  | "feedback" // PostToolUse — the message enters context, the agent self-corrects
  | "gate"; // Stop + CI (verify-ci) — blocks the merge, not the keystroke

/**
 * The set of verification-backend kinds a law can name. `path` runs on the
 * action-time hot path; `deps` and `graph` run in the batch verifier
 * (`law_verify`); the rest are declared-only until a later `executable-laws`
 * slice supplies their engine.
 */
export type VerificationKind =
  "path" | "ast" | "graph" | "deps" | "process" | "traceability" | "semantic" | "none";

/**
 * A dependency-cruiser-style file/import rule for the `deps` backend. `from`/`to`
 * are **regular expressions on POSIX paths** (not globs): a capture group in
 * `from` is referenceable as `$1` in `to`/`toNot`, so one rule covers "no feature
 * imports another feature".
 */
export interface DepsRule {
  /** Optional human name for the rule, surfaced in findings. */
  name?: string;
  /** Regex the source file path must match for the rule to apply. */
  from: string;
  /** Regex the destination file path must match to count as a dependency. */
  to: string;
  /** Optional regex that excludes destinations (e.g. the source's own feature). */
  toNot?: string;
  /** `forbidden` (default): a match is a violation. `required`: absence is. */
  type?: "forbidden" | "required";
  /** Edge kinds to consider; defaults to every kind present in the index. */
  edgeKinds?: string[];
}

/**
 * A rule for the `graph` backend: dependency cycles and transitive reachability
 * over the file-level import graph.
 */
export interface GraphRule {
  /** Optional human name for the rule, surfaced in findings. */
  name?: string;
  /** Forbid dependency cycles among the files in scope. */
  circular?: boolean;
  /** Forbid a transitive path from a `from` file to any `to` file. */
  reachable?: boolean;
  /** Regex on the source file path (used by `reachable`). */
  from?: string;
  /** Regex on the destination file path (used by `reachable`). */
  to?: string;
}

/**
 * How a law is checked, as a discriminated union on `kind`. This EXTENDS the
 * check-dispatcher model — it never rewrites it: the `path` and other
 * payload-free arms are unchanged, and `deps`/`graph` add a validated rule
 * payload. A manifest entry written by an older version whose `verification` is
 * `{ "kind": "path" }` still validates against the `path` arm.
 */
export type Verification =
  | { kind: "path" }
  | { kind: "deps"; rule: DepsRule }
  | { kind: "graph"; rule: GraphRule }
  | { kind: "ast" }
  | { kind: "process" }
  | { kind: "traceability" }
  | { kind: "semantic" }
  | { kind: "none" };

/** A single declared law in the manifest. */
export interface Law {
  /** OFT-style stable id, e.g. `law~protect-templates~1`. */
  id: string;
  title: string;
  /** WHY the law exists — cited when a violation is reported. */
  rationale?: string;
  severity: Severity;
  /** Globs the law applies to; an empty array means "everywhere". */
  scope: string[];
  /** The natural-language instruction, cited verbatim when blocking. */
  prose: string;
  verification: Verification;
  enforcement: Enforcement;
  /** Provenance, so a block can point back at the source. */
  source: { file: string; line?: number };
}

/** The compiled law manifest persisted to `.speclaw/laws-manifest.json`. */
export interface LawManifest {
  /** Manifest format version, independent of the package version. */
  version: number;
  laws: Law[];
}

const depsRuleSchema = z.object({
  name: z.string().optional(),
  from: z.string(),
  to: z.string(),
  toNot: z.string().optional(),
  type: z.enum(["forbidden", "required"]).optional(),
  edgeKinds: z.array(z.string()).optional(),
});

const graphRuleSchema = z.object({
  name: z.string().optional(),
  circular: z.boolean().optional(),
  reachable: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const verificationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("path") }),
  z.object({ kind: z.literal("deps"), rule: depsRuleSchema }),
  z.object({ kind: z.literal("graph"), rule: graphRuleSchema }),
  z.object({ kind: z.literal("ast") }),
  z.object({ kind: z.literal("process") }),
  z.object({ kind: z.literal("traceability") }),
  z.object({ kind: z.literal("semantic") }),
  z.object({ kind: z.literal("none") }),
]);

const lawSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().optional(),
  severity: z.enum(["error", "warn", "info"]),
  scope: z.array(z.string()),
  prose: z.string().min(1),
  verification: verificationSchema,
  enforcement: z.enum(["bloqueo", "feedback", "gate"]),
  source: z.object({ file: z.string(), line: z.number().optional() }),
});

// Reject a malformed `from`/`to` regex when the manifest is validated — naming
// the law id, not a bare array index — rather than letting it explode at verify
// time. Mirrors the generation-time treatment of malformed globs.
const manifestSchema = z
  .object({
    version: z.number(),
    laws: z.array(lawSchema),
  })
  .superRefine((manifest, ctx) => {
    manifest.laws.forEach((law, i) => {
      const v = law.verification;
      const patterns: Array<[string, string | undefined]> = [];
      if (v.kind === "deps") {
        patterns.push(["from", v.rule.from], ["to", v.rule.to], ["toNot", v.rule.toNot]);
      } else if (v.kind === "graph") {
        patterns.push(["from", v.rule.from], ["to", v.rule.to]);
      }
      for (const [field, pattern] of patterns) {
        if (pattern == null) continue;
        const err = regexError(pattern);
        if (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["laws", i, "verification", "rule", field],
            message: `${law.id}: verification.rule.${field} is not a valid regular expression (${err})`,
          });
        }
      }
    });
  });

/** Backends evaluated on the action-time hot path (`speclaw_check`) — glob only. */
export const IMPLEMENTED_BACKENDS: readonly VerificationKind[] = ["path"];

/** Backends evaluated by the batch verifier (`law_verify`) — they read the index. */
export const BATCH_BACKENDS: readonly VerificationKind[] = ["deps", "graph"];

/** True when a law is evaluated on the action-time hot path (only `path` today). */
export function hasBackend(law: Law): boolean {
  return IMPLEMENTED_BACKENDS.includes(law.verification.kind);
}

/** True when a law is evaluated by the batch verifier (`deps`/`graph`). */
export function hasBatchBackend(law: Law): boolean {
  return BATCH_BACKENDS.includes(law.verification.kind);
}

/**
 * Validate a regular expression without using it, so manifest generation and
 * `doctor` can fail loudly on a malformed `from`/`to` pattern.
 *
 * @param pattern - A regular-expression source string.
 * @returns An error message if the pattern does not compile, else null.
 */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/** Absolute path to a project's compiled law manifest (under the gitignored `.speclaw/`). */
export function manifestPath(projectPath: string): string {
  return path.join(projectPath, ".speclaw", "laws-manifest.json");
}

/**
 * Read and validate a project's law manifest.
 *
 * @param projectPath - Project root to read from.
 * @returns The parsed manifest, or null if it is missing or unparseable (the
 *   caller fails open — a broken manifest never blocks the agent).
 */
export function readLawManifest(projectPath: string): LawManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
    return manifestSchema.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a project's law manifest, validating every law first.
 *
 * @param projectPath - Project root to write into.
 * @param manifest - The manifest to persist; each law is schema-validated.
 * @throws If any law fails validation.
 */
export function writeLawManifest(projectPath: string, manifest: LawManifest): void {
  const validated = manifestSchema.parse(manifest);
  const p = manifestPath(projectPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(validated, null, 2) + "\n");
}

/**
 * The starter law manifest shipped with speclaw, seeded from a speclaw-style
 * project's own `path`-verifiable Project-specific laws. It is the source the
 * MVP compiles into `.speclaw/laws-manifest.json`; once executable-laws lands,
 * laws are authored in `docs/standards/*` and compiled here instead. Laws whose
 * scope does not match a given repo are simply inert there.
 *
 * @returns The validated seed manifest read from the module's assets.
 * @throws If the seed asset is missing or fails validation.
 */
export function seedManifest(): LawManifest {
  const raw = JSON.parse(fs.readFileSync(path.join(ASSETS, "laws", "laws-manifest.json"), "utf8"));
  return manifestSchema.parse(raw);
}

/**
 * The manifest the batch verifier should use: the project's file when present,
 * otherwise the shipped seed (so a clean CI clone does not silently pass).
 *
 * @param projectPath - Project root to read from.
 */
export function loadManifestForVerify(projectPath: string): LawManifest {
  return readLawManifest(projectPath) ?? seedManifest();
}

/**
 * Append shipped seed laws whose `id` is not already in `existing`. Existing
 * entries are never overwritten — a curated law keeps its prose, scope, and
 * enforcement across `update`.
 *
 * @param existing - The project's current manifest.
 * @returns The merged manifest and the ids that were added.
 */
export function mergeSeedLaws(existing: LawManifest): { manifest: LawManifest; added: string[] } {
  const seed = seedManifest();
  const have = new Set(existing.laws.map((l) => l.id));
  const extra = seed.laws.filter((l) => !have.has(l.id));
  if (extra.length === 0) return { manifest: existing, added: [] };
  return {
    manifest: { ...existing, laws: [...existing.laws, ...extra] },
    added: extra.map((l) => l.id),
  };
}

// ─── Glob matching (the `path` backend) ──────────────────────────────────────

/**
 * Validate a scope glob without compiling it for use, so generation can fail
 * loudly on a malformed pattern (e.g. an unclosed `[`) rather than silently
 * matching zero files at runtime.
 *
 * @param pattern - A single scope glob (a leading `!` negation is allowed).
 * @returns An error message if the glob is malformed, else null.
 */
export function globError(pattern: string): string | null {
  try {
    compileGlob(pattern);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/** Regex-special characters that are literals in a glob and must be escaped. */
const REGEX_SPECIALS = new Set([".", "+", "^", "$", "(", ")", "|", "\\"]);

/**
 * Compile a glob into an anchored regular expression matching a POSIX-style
 * relative path. Supports `**` (any run of segments), `*`/`?` (within a
 * segment), `{a,b}` alternation, and `[...]`/`[!...]` character classes.
 *
 * @param pattern - A single scope glob; a leading `!` is stripped by the caller.
 * @returns A `RegExp` anchored to the whole path.
 * @throws If the glob contains an unclosed `[` or `{`.
 */
export function compileGlob(pattern: string): RegExp {
  let re = "";
  let braceDepth = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**` (optionally followed by `/`) spans any number of segments.
        i++;
        if (pattern[i + 1] === "/") i++;
        re += "(?:[^/]*(?:/|$))*";
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "{") {
      braceDepth++;
      re += "(?:";
    } else if (ch === "}") {
      if (braceDepth === 0) throw new Error(`unmatched '}' in glob: ${pattern}`);
      braceDepth--;
      re += ")";
    } else if (ch === "," && braceDepth > 0) {
      re += "|";
    } else if (ch === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) throw new Error(`unclosed '[' in glob: ${pattern}`);
      let cls = pattern.slice(i + 1, close);
      if (cls.startsWith("!")) cls = "^" + cls.slice(1);
      re += `[${cls}]`;
      i = close;
    } else if (REGEX_SPECIALS.has(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  if (braceDepth !== 0) throw new Error(`unclosed '{' in glob: ${pattern}`);
  return new RegExp(`^${re}$`);
}

/** A scope compiled once into positive/negative matchers — the hot-path index. */
export interface CompiledScope {
  /** True when the scope was empty, meaning it matches every path. */
  matchAll: boolean;
  positives: RegExp[];
  negatives: RegExp[];
}

/**
 * Compile a law's scope globs into regexes once, so runtime matching does no
 * regex compilation on the critical path. Malformed globs are dropped (they are
 * caught and reported at generation time).
 *
 * @param scope - The law's scope globs.
 * @returns The compiled positive and negative matchers.
 */
export function compileScope(scope: string[]): CompiledScope {
  const positives: RegExp[] = [];
  const negatives: RegExp[] = [];
  for (const g of scope) {
    const negated = g.startsWith("!");
    try {
      (negated ? negatives : positives).push(compileGlob(negated ? g.slice(1) : g));
    } catch {
      // Skip malformed globs — generation already flagged them.
    }
  }
  return { matchAll: scope.length === 0, positives, negatives };
}

/**
 * Test a target path against a pre-compiled scope. Positive globs are OR-ed; a
 * `!`-prefixed glob excludes; an empty scope matches everything.
 *
 * @param compiled - The scope compiled by {@link compileScope}.
 * @param target - A POSIX-style project-relative path (forward slashes).
 * @returns True when the target is in scope.
 */
export function matchCompiled(compiled: CompiledScope, target: string): boolean {
  const included =
    compiled.matchAll ||
    compiled.positives.length === 0 ||
    compiled.positives.some((r) => r.test(target));
  return included && !compiled.negatives.some((r) => r.test(target));
}

/**
 * Test whether a target path matches a law's scope, compiling on the spot.
 * Convenience for non-hot paths (doctor, dry-run); the evaluator uses
 * {@link compileScope} + {@link matchCompiled} to stay off the compiler.
 *
 * @param scope - The law's scope globs.
 * @param target - A POSIX-style project-relative path (forward slashes).
 * @returns True when the target is in scope. Malformed globs never match.
 */
export function matchesScope(scope: string[], target: string): boolean {
  return matchCompiled(compileScope(scope), target);
}
