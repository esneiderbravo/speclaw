/**
 * MCP response of `compass_find`: compact hits and one JSON document capped as a whole at the
 * caller's token budget. The CLI keeps printing `HybridSearchResult` as is.
 */

import { renderTreeContext } from "./budget.js";
import type { HybridHit, HybridSearchResult, SymbolRef } from "./hybrid.js";
import { estimateTokens } from "../../shared/output-budget.js";

/** What {@link findSymbols} returns: the hybrid result plus the MCP-only facts. */
export interface FindResult extends HybridSearchResult {
  mode: "exact" | "concept";
  /** Focus inputs dropped because the index has no such file. */
  focusIgnored: string[];
  /** Exact mode: whether any symbol is named exactly a term. */
  found?: boolean;
  /** Exact mode: the identifier terms the query was split into. */
  terms?: string[];
  /** Exact mode with `found` false: up to five near names. */
  nearest?: SymbolRef[];
  /** The token cap the response must fit. */
  cap: number;
  /** True when the ranked list held hits the cap left out. */
  capped: boolean;
}

/** The JSON document `compass_find` emits. */
export interface FindResponse {
  mode: "exact" | "concept";
  found?: boolean;
  terms?: string[];
  rendered: string;
  hits: SymbolRef[];
  nearest?: SymbolRef[];
  focus: string[];
  focusIgnored?: string[];
  degraded?: string[];
  /** Length of `terms` before the cap trimmed it (present only when trimmed). */
  termsTotal?: number;
  /** Length of `focus` before the cap trimmed it (present only when trimmed). */
  focusTotal?: number;
  /** Length of `focusIgnored` before the cap trimmed it (present only when trimmed). */
  focusIgnoredTotal?: number;
  tokens: number;
  budget: number;
  truncated?: true;
}

function compact(h: SymbolRef): SymbolRef {
  return { name: h.name, kind: h.kind, file: h.file, line: h.line };
}

/** Rendered blocks for the first `count` hits, the same TreeContext the search produced. */
function renderHits(hits: HybridHit[], count: number): string {
  return renderTreeContext(hits.slice(0, count));
}

/**
 * Serialise `response`, writing `tokens` last so it equals the estimate of the
 * whole emitted text (at most a few passes until the digit count is stable).
 */
function emit(response: FindResponse): string {
  response.tokens = 0;
  let out = JSON.stringify(response);
  for (let i = 0; i < 4; i++) {
    const t = estimateTokens(out);
    if (t === response.tokens) break;
    response.tokens = t;
    out = JSON.stringify(response);
  }
  return out;
}

/** Cut `rendered` to about `chars` characters at a line break, marking the elision. */
function shortenRendered(rendered: string, chars: number): string {
  if (chars <= 0) return "";
  if (rendered.length <= chars) return rendered;
  const head = rendered.slice(0, chars);
  const cut = head.lastIndexOf("\n");
  return `${cut > 0 ? head.slice(0, cut) : head}\n⋮`;
}

/**
 * Largest `k` in `[0, len]` for which `fitsAt(k)` holds, assuming fitting is
 * monotone in `k` (a shorter list never makes the text longer); `-1` when even
 * an empty list does not fit.
 */
function largestFitting(len: number, fitsAt: (k: number) => boolean): number {
  if (!fitsAt(0)) return -1;
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fitsAt(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Format a find result as the exact text `compass_find` emits: one JSON
 * document (no indentation) whose estimated tokens never exceed the cap.
 * Over the cap it first trims `focusIgnored`, `focus`, and `terms` from the
 * end (each trimmed list reports its original length in a `…Total` field),
 * then drops the lowest-ranked hits together with their rendered blocks, then
 * shortens `rendered` of the last hit, then drops `nearest` entries from the
 * end. `truncated` is set when the search or the formatter removed
 * anything, so the cap holds and the text parses as JSON for any input.
 *
 * @param result - Output of {@link findSymbols}.
 * @returns The text to pass to `text(str, { maxTokens: result.cap })`.
 */
// Covers: req~find-response-budget~1
export function formatFindResponse(result: FindResult): string {
  const cap = result.cap;
  let count = result.hits.length;
  let rendered = result.rendered;
  let nearest = result.nearest ? result.nearest.map(compact) : undefined;
  let truncated = result.capped;
  const terms = result.terms ?? [];
  // Kept lengths of the context lists; trimmed before any hit.
  let termsKept = terms.length;
  let focusKept = result.focus.length;
  let ignoredKept = result.focusIgnored.length;

  const build = (): FindResponse => ({
    mode: result.mode,
    ...(result.mode === "exact"
      ? {
          found: result.found ?? false,
          terms: terms.slice(0, termsKept),
          ...(termsKept < terms.length ? { termsTotal: terms.length } : {}),
        }
      : {}),
    rendered,
    hits: result.hits.slice(0, count).map(compact),
    ...(nearest ? { nearest } : {}),
    focus: result.focus.slice(0, focusKept),
    ...(focusKept < result.focus.length ? { focusTotal: result.focus.length } : {}),
    ...(result.focusIgnored.length > 0
      ? { focusIgnored: result.focusIgnored.slice(0, ignoredKept) }
      : {}),
    ...(ignoredKept < result.focusIgnored.length
      ? { focusIgnoredTotal: result.focusIgnored.length }
      : {}),
    ...(result.degraded.length > 0 ? { degraded: result.degraded } : {}),
    tokens: 0,
    budget: cap,
    ...(truncated ? { truncated: true as const } : {}),
  });
  const fits = (): string | null => {
    const out = emit(build());
    return estimateTokens(out) <= cap ? out : null;
  };

  let out = fits();
  // 1. Trim the context lists from the end: focusIgnored, focus, then terms.
  // They matter less than the payload, so they go before any hit. Each list is
  // cut to the longest prefix that fits (binary search, so a worktree with
  // thousands of changes costs O(log n) serialisations), or emptied.
  const lists: Array<{ len: number; set: (k: number) => void }> = [
    { len: result.focusIgnored.length, set: (k) => (ignoredKept = k) },
    { len: result.focus.length, set: (k) => (focusKept = k) },
    { len: terms.length, set: (k) => (termsKept = k) },
  ];
  for (const list of lists) {
    if (out || list.len === 0) continue;
    truncated = true;
    const k = largestFitting(list.len, (n) => {
      list.set(n);
      return fits() !== null;
    });
    list.set(Math.max(k, 0));
    out = fits();
  }
  // 2. Drop the lowest-ranked hits with their rendered blocks.
  while (!out && count > 1) {
    count--;
    rendered = renderHits(result.hits, count);
    truncated = true;
    out = fits();
  }
  // 3. One hit left: shorten its rendered block.
  if (!out && rendered) {
    truncated = true;
    rendered = "";
    const room = (cap - estimateTokens(emit(build()))) * 4 - 8;
    rendered = shortenRendered(renderHits(result.hits, count), room);
    out = fits();
    if (!out) {
      rendered = "";
      out = fits();
    }
  }
  // 4. Drop nearest entries from the end.
  while (!out && nearest && nearest.length > 0) {
    nearest = nearest.slice(0, -1);
    truncated = true;
    out = fits();
  }
  // 5. Last resort (a single hit larger than the cap): drop the hit.
  if (!out && count > 0) {
    count = 0;
    rendered = "";
    truncated = true;
    out = fits();
  }
  return out ?? emit(build());
}
