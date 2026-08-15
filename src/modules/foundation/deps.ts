import type { DatabaseSync } from "node:sqlite";
import { DepsRule, Law } from "./laws.js";
import type { Finding } from "./verify.js";
import { underPaths } from "./verify.js";

// Motor B — the `deps` backend. File-granularity dependency rules evaluated as
// SQL over the existing `edges`/`nodes`/`files` tables (no new table): it
// resolves each edge's `dst_node_id` to its file and matches source/destination
// paths against the rule's regexes. An edge whose destination did not resolve is
// *unknown*, never a pass — conflating the two hides violations silently.

/** What an engine returns for one law: located violations plus an unknown count. */
export interface EngineResult {
  findings: Finding[];
  /** Edges in the law's `from` scope whose destination did not resolve. */
  unresolved: number;
}

/** A resolved file→file dependency edge. */
interface ResolvedEdge {
  src: string;
  dst: string;
  line: number;
}

/** Substitute `$1`, `$2`, … in a pattern with capture groups from a match. */
function applyGroups(pattern: string, match: RegExpMatchArray): string {
  return pattern.replace(/\$(\d+)/g, (_whole, d: string) => match[Number(d)] ?? "");
}

/** The `IN (?, ?)` clause and params for an optional edge-kind filter. */
function edgeKindClause(edgeKinds: string[] | undefined): { sql: string; params: string[] } {
  if (!edgeKinds || edgeKinds.length === 0) return { sql: "", params: [] };
  return { sql: ` AND e.kind IN (${edgeKinds.map(() => "?").join(", ")})`, params: edgeKinds };
}

/** Load resolved file→file edges (earliest line per pair) from the index. */
function resolvedEdges(db: DatabaseSync, edgeKinds: string[] | undefined): ResolvedEdge[] {
  const kind = edgeKindClause(edgeKinds);
  return db
    .prepare(
      `SELECT sf.path AS src, df.path AS dst, MIN(e.line) AS line
       FROM edges e
       JOIN files sf ON sf.id = e.src_file_id
       JOIN nodes dn ON dn.id = e.dst_node_id
       JOIN files df ON df.id = dn.file_id
       WHERE e.dst_node_id IS NOT NULL${kind.sql}
       GROUP BY sf.path, df.path`,
    )
    .all(...kind.params) as unknown as ResolvedEdge[];
}

/** Count unresolved edges (`dst_node_id IS NULL`) per source file. */
function unresolvedBySource(
  db: DatabaseSync,
  edgeKinds: string[] | undefined,
): Array<{ src: string; n: number }> {
  const kind = edgeKindClause(edgeKinds);
  return db
    .prepare(
      `SELECT sf.path AS src, COUNT(*) AS n
       FROM edges e
       JOIN files sf ON sf.id = e.src_file_id
       WHERE e.dst_node_id IS NULL${kind.sql}
       GROUP BY sf.path`,
    )
    .all(...kind.params) as unknown as Array<{ src: string; n: number }>;
}

/**
 * Evaluate one `deps` law against the index.
 *
 * A `forbidden` rule emits a finding for every resolved edge whose source
 * matches `from` and whose destination matches `to` (excluding `toNot`); a
 * `required` rule emits a finding for every `from` file with no resolved edge to
 * any `to` destination. `from` may carry a capture group referenced as `$1` in
 * `to`/`toNot`, so one rule expresses "no feature imports another feature".
 *
 * @param db - An open connection to the project's index.
 * @param law - The `deps` law to evaluate.
 * @param paths - Optional project-relative paths restricting the source files.
 * @returns The findings and the count of unresolved in-scope edges.
 */
export function runDepsLaw(db: DatabaseSync, law: Law, paths?: string[]): EngineResult {
  const rule = (law.verification as { kind: "deps"; rule: DepsRule }).rule;
  const fromRe = new RegExp(rule.from);
  const type = rule.type ?? "forbidden";
  const findings: Finding[] = [];

  const inScope = (src: string): RegExpMatchArray | null =>
    underPaths(src, paths) ? src.match(fromRe) : null;

  const matchesTo = (dst: string, m: RegExpMatchArray): boolean => {
    const toRe = new RegExp(applyGroups(rule.to, m));
    if (!toRe.test(dst)) return false;
    if (rule.toNot && new RegExp(applyGroups(rule.toNot, m)).test(dst)) return false;
    return true;
  };

  const edges = resolvedEdges(db, rule.edgeKinds);

  if (type === "forbidden") {
    for (const e of edges) {
      const m = inScope(e.src);
      if (!m) continue;
      if (matchesTo(e.dst, m)) {
        findings.push({
          lawId: law.id,
          severity: law.severity,
          engine: "deps",
          file: e.src,
          line: e.line,
          message: law.prose,
          detail: `→ ${e.dst}`,
        });
      }
    }
  } else {
    // required: every `from` file must have at least one edge to a `to` file.
    const bySrc = new Map<string, ResolvedEdge[]>();
    for (const e of edges) {
      const list = bySrc.get(e.src);
      if (list) list.push(e);
      else bySrc.set(e.src, [e]);
    }
    const files = (db.prepare("SELECT path FROM files").all() as unknown as { path: string }[]).map(
      (r) => r.path,
    );
    for (const src of files) {
      const m = inScope(src);
      if (!m) continue;
      const satisfied = (bySrc.get(src) ?? []).some((e) => matchesTo(e.dst, m));
      if (!satisfied) {
        findings.push({
          lawId: law.id,
          severity: law.severity,
          engine: "deps",
          file: src,
          message: law.prose,
          detail: `required dependency to ${rule.to} is missing`,
        });
      }
    }
  }

  let unresolved = 0;
  for (const row of unresolvedBySource(db, rule.edgeKinds)) {
    if (inScope(row.src)) unresolved += row.n;
  }

  return { findings, unresolved };
}
