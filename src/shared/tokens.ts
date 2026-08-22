/**
 * Deterministic token estimator. NOT a tokenizer: intended accuracy about ±8%
 * against Anthropic's tokenizer on speclaw's own asset corpus. Intentionally
 * not exact — a real BPE vocab is a multi-megabyte dependency, and exact counts
 * are model-dependent. The CI gate needs a number that is stable across versions.
 *
 * Contract: monotone (more text ⇒ more or equal tokens) and stable across runs
 * and processes. Performs no network I/O.
 *
 * @param text - Input to estimate.
 * @returns Estimated token count (non-negative integer).
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const chunks = text.match(/[A-Za-z]+|\d+|\s+|[^\sA-Za-z\d]/g) ?? [];
  let total = 0;
  for (const c of chunks) {
    if (/^[A-Za-z]+$/.test(c)) total += Math.ceil(c.length / 4.1);
    else if (/^\d+$/.test(c)) total += Math.ceil(c.length / 2.5);
    else if (/^\s+$/.test(c)) total += c.includes("\n") ? 1 : 0;
    else total += 1;
  }
  return total;
}

/**
 * Count whitespace-separated words in a description (for the ≤25-word cap).
 *
 * @param description - Tool description prose.
 * @returns Word count.
 */
export function countWords(description: string): number {
  const trimmed = description.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
