/** Declared output token ceilings (estimator v1: ~4 chars per token). */
export const OUTPUT_BUDGET = {
  brief: 1500,
  full: 4500,
} as const;

export type OutputMode = keyof typeof OUTPUT_BUDGET;

export interface TruncationEntry {
  field: string;
  omitted: number;
  hint: string;
}

const TRUNCATION_SUFFIX = `\n… [truncated — use mode:"full" or narrow includes]`;

/** Stable offline token estimate for budgeting (not a real tokenizer). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trim `text` to fit `mode` budget; returns the possibly shortened text and
 * whether truncation occurred.
 */
export function applyTextBudget(
  text: string,
  mode: OutputMode = "brief",
): { text: string; truncated: boolean; omittedChars: number } {
  const budget = OUTPUT_BUDGET[mode];
  const tokens = estimateTokens(text);
  if (tokens <= budget) return { text, truncated: false, omittedChars: 0 };
  const suffixTokens = estimateTokens(TRUNCATION_SUFFIX);
  const bodyBudget = Math.max(1, budget - suffixTokens);
  const maxChars = bodyBudget * 4;
  const trimmed = text.slice(0, maxChars);
  return {
    text: trimmed + TRUNCATION_SUFFIX,
    truncated: true,
    omittedChars: text.length - maxChars,
  };
}

/**
 * Truncate known list fields on an explore-style object before serialization.
 *
 * @param value - Plain object to mutate in place (arrays shortened, counts kept).
 * @param mode - Output mode controlling list limits.
 * @param truncated - Collector for explicit truncation records.
 */
export function budgetExploreShape(
  value: Record<string, unknown>,
  mode: OutputMode,
  truncated: TruncationEntry[],
): void {
  const maxCallers = mode === "full" ? 40 : 12;
  const maxSourceLines = mode === "full" ? 120 : 40;

  const symbol = value.symbol as Record<string, unknown> | undefined;
  if (symbol && typeof symbol.source === "string") {
    const lines = symbol.source.split("\n");
    if (lines.length > maxSourceLines) {
      const omitted = lines.length - maxSourceLines;
      symbol.source = lines.slice(0, maxSourceLines).join("\n") + "\n…";
      truncated.push({
        field: "symbol.source",
        omitted,
        hint: 'use mode:"full" or omit source from include',
      });
    }
  }

  for (const field of ["callers", "callees"] as const) {
    const list = value[field];
    if (!Array.isArray(list)) continue;
    if (list.length > maxCallers) {
      const omitted = list.length - maxCallers;
      value[`${field}Total`] = list.length;
      value[field] = list.slice(0, maxCallers);
      truncated.push({
        field,
        omitted,
        hint: 'use mode:"full" or narrow with include',
      });
    }
  }
}
