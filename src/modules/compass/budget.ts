/**
 * Fit ranked retrieval hits into a token budget via binary search, and render
 * a compact TreeContext with elision markers.
 */

/** One ranked hit with enough fields to render. */
export interface BudgetHit {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature: string | null;
  /** Optional body excerpt; when absent, signature/name only. */
  excerpt?: string;
}

export interface FitResult {
  rendered: string;
  /** Actual token estimate of `rendered`. */
  tokens: number;
  budget: number;
  hitCount: number;
}

/**
 * Rough token estimate: ~4 chars/token, sampling every 100th line on large text.
 *
 * @param s - Text to estimate.
 */
export function estimateTokens(s: string): number {
  if (s.length < 4000) return Math.ceil(s.length / 4);
  const lines = s.split("\n");
  if (lines.length < 200) return Math.ceil(s.length / 4);
  let sampled = 0;
  let count = 0;
  for (let i = 0; i < lines.length; i += 100) {
    sampled += lines[i]!.length + 1;
    count++;
  }
  const avg = sampled / Math.max(count, 1);
  return Math.ceil((avg * lines.length) / 4);
}

/**
 * Render hits as a TreeContext block with `⋮` elision between non-adjacent lines.
 *
 * @param hits - Ordered hits to include.
 */
export function renderTreeContext(hits: BudgetHit[]): string {
  if (hits.length === 0) return "";
  const byFile = new Map<string, BudgetHit[]>();
  for (const h of hits) {
    const list = byFile.get(h.file) ?? [];
    list.push(h);
    byFile.set(h.file, list);
  }
  const parts: string[] = [];
  for (const [file, list] of byFile) {
    parts.push(`# ${file}`);
    list.sort((a, b) => a.line - b.line);
    let lastLine = -Infinity;
    for (const h of list) {
      if (h.line - lastLine > 3 && lastLine !== -Infinity) parts.push("⋮");
      const sig = h.signature ?? `${h.kind} ${h.name}`;
      parts.push(`${h.line}| ${sig}`);
      if (h.excerpt) {
        const lines = h.excerpt.split("\n");
        if (lines.length > 6) {
          parts.push(...lines.slice(0, 3).map((l) => `  ${l}`));
          parts.push("  ⋮");
          parts.push(...lines.slice(-2).map((l) => `  ${l}`));
        } else {
          parts.push(...lines.map((l) => `  ${l}`));
        }
      }
      lastLine = h.line;
    }
  }
  return parts.join("\n");
}

/**
 * Binary-search how many leading hits fit `maxTokens` within 15% tolerance.
 * Never returns empty when hits is non-empty — truncates the first hit instead.
 *
 * @param ranked - Hits in final rank order.
 * @param maxTokens - Token budget.
 */
export function fitToBudget(ranked: BudgetHit[], maxTokens: number): FitResult {
  const budget = Math.max(1, maxTokens);
  if (ranked.length === 0) {
    return { rendered: "", tokens: 0, budget, hitCount: 0 };
  }

  let lower = 1;
  let upper = ranked.length;
  let best = renderTreeContext(ranked.slice(0, 1));
  let bestCount = 1;

  while (lower <= upper) {
    const mid = (lower + upper) >> 1;
    const tree = renderTreeContext(ranked.slice(0, mid));
    const n = estimateTokens(tree);
    if (Math.abs(n - budget) / budget < 0.15) {
      return { rendered: tree, tokens: n, budget, hitCount: mid };
    }
    if (n <= budget) {
      best = tree;
      bestCount = mid;
      lower = mid + 1;
    } else {
      upper = mid - 1;
    }
  }

  // Single oversized hit: truncate excerpt.
  if (bestCount === 1 && estimateTokens(best) > budget) {
    const h = { ...ranked[0]!, excerpt: truncateExcerpt(ranked[0]!.excerpt, budget) };
    const rendered = renderTreeContext([h]);
    return { rendered, tokens: estimateTokens(rendered), budget, hitCount: 1 };
  }

  return {
    rendered: best,
    tokens: estimateTokens(best),
    budget,
    hitCount: bestCount,
  };
}

function truncateExcerpt(excerpt: string | undefined, budget: number): string {
  if (!excerpt) return "";
  const maxChars = Math.max(32, budget * 3);
  if (excerpt.length <= maxChars) return excerpt;
  return `${excerpt.slice(0, maxChars)}\n⋮`;
}

/**
 * Default token budget inspired by aider: clamp between 1024 and 4096, ×8 when
 * there is no focus set.
 *
 * @param hasFocus - Whether a non-empty focus file set is in use.
 * @param maxInput - Optional model input window hint.
 */
export function defaultBudget(hasFocus: boolean, maxInput = 32_000): number {
  const base = Math.max(1024, Math.min(Math.floor(maxInput / 8), 4096));
  return hasFocus ? base : base * 8;
}
