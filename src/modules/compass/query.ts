import fs from "node:fs";
import path from "node:path";
import { openDb, indexExists } from "./db.js";
import { getEmbedder, fromBlob, cosine } from "./embedder.js";

/** A single node matched by a structural or semantic search. */
export interface SearchHit {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature: string | null;
}

/** Result of exploring a node: its source plus its callees and callers. */
export interface ExploreResult {
  found: boolean;
  symbol?: {
    name: string;
    kind: string;
    file: string;
    startLine: number;
    endLine: number;
    signature: string | null;
    source: string;
  };
  callees?: Array<{ name: string; file?: string; line: number }>;
  callers?: Array<{ name: string; kind: string; file: string; line: number }>;
  otherMatches?: SearchHit[];
  message?: string;
}

function requireIndex(projectPath: string): void {
  if (!indexExists(projectPath)) {
    throw new Error(
      "No index found. Build it first with the index_build tool (creates .speclaw/index.db).",
    );
  }
}

/**
 * Structural search: find nodes whose name contains `query` (substring match),
 * ranking exact matches and shorter names first.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Name or keyword to match as a substring.
 * @param limit - Maximum number of hits to return.
 * @returns Matching nodes ordered by relevance.
 * @throws If no index exists for the project.
 */
export function search(projectPath: string, query: string, limit = 25): SearchHit[] {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT s.name, s.kind, f.path AS file, s.start_line AS line, s.signature
         FROM nodes s JOIN files f ON f.id = s.file_id
         WHERE s.name LIKE ?
         ORDER BY (s.name = ?) DESC, length(s.name) ASC
         LIMIT ?`,
      )
      .all(`%${query}%`, query, limit) as unknown as SearchHit[];
    return rows;
  } finally {
    db.close();
  }
}

function readSource(projectPath: string, file: string, startByte: number, endByte: number): string {
  try {
    const buf = fs.readFileSync(path.join(projectPath, file));
    return buf.subarray(startByte, endByte).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Explore an exact node by name: return its verbatim source, callees, and
 * callers (its blast radius).
 *
 * When several nodes share the name, functions and classes are preferred as the
 * primary result and the rest are surfaced under `otherMatches`. When no exact
 * match exists, falls back to a fuzzy {@link search} so the caller still gets
 * useful candidates.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Exact node name to explore.
 * @returns The explore result; `found` is `false` when no exact match exists.
 * @throws If no index exists for the project.
 */
export function explore(projectPath: string, query: string): ExploreResult {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    const matches = db
      .prepare(
        `SELECT s.id, s.name, s.kind, s.start_line, s.end_line, s.start_byte, s.end_byte,
                s.signature, f.path AS file
         FROM nodes s JOIN files f ON f.id = s.file_id
         WHERE s.name = ?
         ORDER BY s.kind = 'function' DESC, s.kind = 'class' DESC
         LIMIT 10`,
      )
      .all(query) as Array<{
      id: number;
      name: string;
      kind: string;
      start_line: number;
      end_line: number;
      start_byte: number;
      end_byte: number;
      signature: string | null;
      file: string;
    }>;

    if (matches.length === 0) {
      // fall back to fuzzy search so the caller gets something useful
      const near = search(projectPath, query, 10);
      return {
        found: false,
        message: `No exact symbol named "${query}". ${near.length} similar symbol(s) below.`,
        otherMatches: near,
      };
    }

    const best = matches[0]!;
    const callees = db
      .prepare(
        `SELECT e.dst_name AS name, e.line, f.path AS file
         FROM edges e LEFT JOIN nodes s ON s.id = e.dst_node_id
         LEFT JOIN files f ON f.id = s.file_id
         WHERE e.src_node_id = ? AND e.kind = 'call'
         ORDER BY e.line`,
      )
      .all(best.id) as Array<{ name: string; line: number; file: string | null }>;

    // Callers: match both the resolved edge AND any call by this name, so
    // dynamic dispatch (a method/function called by name across sites) is not
    // missed. Over-approximates conservatively — the point of a blast radius.
    const callers = db
      .prepare(
        `SELECT DISTINCT owner.name AS name, owner.kind AS kind, f.path AS file, e.line
         FROM edges e
         JOIN nodes owner ON owner.id = e.src_node_id
         JOIN files f ON f.id = owner.file_id
         WHERE (e.dst_node_id = ? OR e.dst_name = ?) AND e.kind = 'call'
         ORDER BY f.path, e.line`,
      )
      .all(best.id, best.name) as Array<{ name: string; kind: string; file: string; line: number }>;

    return {
      found: true,
      symbol: {
        name: best.name,
        kind: best.kind,
        file: best.file,
        startLine: best.start_line,
        endLine: best.end_line,
        signature: best.signature,
        source: readSource(projectPath, best.file, best.start_byte, best.end_byte),
      },
      callees: callees.map((c) => ({ name: c.name, file: c.file ?? undefined, line: c.line })),
      callers,
      otherMatches:
        matches.length > 1
          ? matches.slice(1).map((m) => ({
              name: m.name,
              kind: m.kind,
              file: m.file,
              line: m.start_line,
              signature: m.signature,
            }))
          : undefined,
    };
  } finally {
    db.close();
  }
}

/** A {@link SearchHit} annotated with its semantic similarity `score`. */
export interface RecallHit extends SearchHit {
  score: number;
}

/**
 * Semantic search: embed the natural-language query and rank nodes by cosine
 * similarity against the local vector store. Finds code by meaning, not just
 * by matching identifier substrings.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param query - Natural-language description of the code being sought.
 * @param limit - Maximum number of hits to return.
 * @returns Nodes sorted by descending similarity score.
 * @throws If no index exists for the project.
 */
export async function recall(projectPath: string, query: string, limit = 15): Promise<RecallHit[]> {
  requireIndex(projectPath);
  const embedder = getEmbedder();
  const qvec = await embedder.embed(query);
  const db = openDb(projectPath);
  try {
    const rows = db
      .prepare(
        `SELECT n.name, n.kind, f.path AS file, n.start_line AS line, n.signature, e.vec
         FROM node_embeddings e
         JOIN nodes n ON n.id = e.node_id
         JOIN files f ON f.id = n.file_id
         WHERE e.dim = ?`,
      )
      .all(embedder.dim) as Array<{
      name: string;
      kind: string;
      file: string;
      line: number;
      signature: string | null;
      vec: Uint8Array;
    }>;

    const scored = rows.map((r) => ({
      name: r.name,
      kind: r.kind,
      file: r.file,
      line: r.line,
      signature: r.signature,
      score: cosine(qvec, fromBlob(r.vec)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } finally {
    db.close();
  }
}

/** A node in the impact set, tagged with the hop `depth` at which it was reached. */
export interface ImpactNode {
  name: string;
  kind: string;
  file: string;
  line: number;
  depth: number;
}

/**
 * Transitive blast radius: every node that (transitively) calls the target,
 * up to maxDepth hops. Expansion is by call-name, so dynamic dispatch is
 * included — the conservative answer to "what could break if I change this?".
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param nodeName - Name of the node whose dependents are wanted.
 * @param maxDepth - Maximum number of call hops to traverse outward.
 * @returns The reached nodes, each tagged with its discovery depth.
 * @throws If no index exists for the project.
 */
export function impact(projectPath: string, nodeName: string, maxDepth = 4): ImpactNode[] {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    const visited = new Set<number>();
    const results: ImpactNode[] = [];
    let frontier = [nodeName];
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const placeholders = frontier.map(() => "?").join(",");
      const callers = db
        .prepare(
          `SELECT DISTINCT owner.id, owner.name, owner.kind, f.path AS file, MIN(owner.start_line) AS line
           FROM edges e
           JOIN nodes owner ON owner.id = e.src_node_id
           JOIN files f ON f.id = owner.file_id
           WHERE e.kind = 'call' AND e.dst_name IN (${placeholders})
           GROUP BY owner.id`,
        )
        .all(...frontier) as Array<{
        id: number;
        name: string;
        kind: string;
        file: string;
        line: number;
      }>;
      const nextNames = new Set<string>();
      for (const c of callers) {
        if (visited.has(c.id)) continue;
        visited.add(c.id);
        results.push({ name: c.name, kind: c.kind, file: c.file, line: c.line, depth });
        nextNames.add(c.name);
      }
      frontier = [...nextNames];
    }
    return results;
  } finally {
    db.close();
  }
}

/** Result of a {@link trace}: the call chain from `from` to `to`, if any. */
export interface TraceResult {
  from: string;
  to: string;
  path: string[] | null;
  hops: number;
}

/**
 * Trace a call path from one node to another: BFS forward over call edges (by
 * name) from `from` until `to` is reached, returning the chain of names. null
 * path means no route within maxDepth.
 *
 * @param projectPath - Absolute path to the indexed project.
 * @param from - Name of the starting node.
 * @param to - Name of the target node.
 * @param maxDepth - Maximum number of call hops to search.
 * @returns The trace result; `path` is `null` and `hops` is `-1` when no route
 * is found within `maxDepth`.
 * @throws If no index exists for the project.
 */
export function trace(projectPath: string, from: string, to: string, maxDepth = 8): TraceResult {
  requireIndex(projectPath);
  const db = openDb(projectPath);
  try {
    if (from === to) return { from, to, path: [from], hops: 0 };
    const parent = new Map<string, string>();
    const seen = new Set<string>([from]);
    let frontier = [from];
    const calleesStmt = db.prepare(
      `SELECT DISTINCT e.dst_name AS callee
       FROM edges e JOIN nodes src ON src.id = e.src_node_id
       WHERE e.kind = 'call' AND src.name = ?`,
    );
    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const name of frontier) {
        const callees = calleesStmt.all(name) as Array<{ callee: string }>;
        for (const { callee } of callees) {
          if (seen.has(callee)) continue;
          seen.add(callee);
          parent.set(callee, name);
          if (callee === to) {
            const path = [to];
            let cur = to;
            while (parent.has(cur)) {
              cur = parent.get(cur)!;
              path.unshift(cur);
            }
            return { from, to, path, hops: path.length - 1 };
          }
          next.push(callee);
        }
      }
      frontier = next;
    }
    return { from, to, path: null, hops: -1 };
  } finally {
    db.close();
  }
}
