/**
 * Content hashes for Compass nodes: raw body bytes vs structural (tree-sitter)
 * normal form. Structural hashes ignore comments and insignificant whitespace
 * while preserving string literals — the dual-hash pair powers drift classification.
 */
import { createHash } from "node:crypto";
import type { Node } from "web-tree-sitter";

/** Bump when the structural walk changes; stored anchors become `stale-hash`. */
export const NORMALIZER_VERSION = 1;

const COMMENT_TYPES = new Set([
  "comment",
  "line_comment",
  "block_comment",
  "html_comment",
  "hash_bang_line",
]);

/** Types whose text is emitted verbatim (spaces inside matter). */
const VERBATIM_TYPES = new Set([
  "string",
  "string_literal",
  "string_fragment",
  "template_string",
  "template_literal",
  "raw_string_literal",
  "regex",
  "regex_pattern",
  "concatenated_string",
]);

function digest(parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) {
    h.update(p);
    h.update("\u0000");
  }
  return h.digest("hex").slice(0, 32);
}

/**
 * Hash of the exact source bytes for a symbol range (detects cosmetic edits).
 *
 * @param source - Full file source as UTF-8 string.
 * @param startByte - Inclusive start offset.
 * @param endByte - Exclusive end offset.
 */
export function rawHash(source: string, startByte: number, endByte: number): string {
  return createHash("sha256").update(source.slice(startByte, endByte)).digest("hex").slice(0, 32);
}

/**
 * Structural hash of a tree-sitter subtree. Invariant to reformatting and
 * comments; sensitive to control flow, identifiers, and string contents.
 *
 * @param node - Definition node from the parse tree.
 */
export function structuralHash(node: Node): string {
  const parts: string[] = [`v${NORMALIZER_VERSION}`];
  const walk = (n: Node): void => {
    if (COMMENT_TYPES.has(n.type)) return;
    if (VERBATIM_TYPES.has(n.type)) {
      parts.push(`str:${n.text}`);
      return;
    }
    if (n.namedChildCount === 0) {
      const t = n.text.trim();
      if (t.length > 0) parts.push(t);
      return;
    }
    parts.push(`(${n.type}`);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) walk(c);
    }
    parts.push(")");
  };
  walk(node);
  return digest(parts);
}
