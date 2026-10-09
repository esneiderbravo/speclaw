/** Declared output token ceilings (estimator v1: ~4 chars per token). */
export const OUTPUT_BUDGET = {
  brief: 1500,
  full: 4500,
} as const;

export type OutputMode = keyof typeof OUTPUT_BUDGET;

/** An output mode, or an explicit token cap a caller opted into. */
export type TextBudget = OutputMode | { maxTokens: number };

export interface TruncationEntry {
  field: string;
  omitted: number;
  hint: string;
}

/** Brief-mode suffix: the caller can still widen the response with `mode:"full"`. */
const TRUNCATION_SUFFIX = `\n… [truncated — use mode:"full" or narrow includes]`;
/** Suffix under the full ceiling or an explicit cap: widening the mode would not help. */
const FINAL_TRUNCATION_SUFFIX = `\n… [truncated — narrow includes or the query]`;

/** Stable offline token estimate for budgeting (not a real tokenizer). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Token ceiling of a {@link TextBudget}.
 *
 * @param budget - Output mode or explicit cap.
 */
export function budgetTokens(budget: TextBudget): number {
  return typeof budget === "string" ? OUTPUT_BUDGET[budget] : Math.max(1, budget.maxTokens);
}

/**
 * Trim `text` to fit `budget`; returns the possibly shortened text and whether
 * truncation occurred. Under `brief` the suffix suggests `mode:"full"`; under
 * `full` or an explicit cap it never does, since that would not widen anything.
 *
 * @param text - Text to budget.
 * @param budget - Output mode (`brief` default) or `{ maxTokens }`.
 */
// Covers: req~find-response-budget~1
export function applyTextBudget(
  text: string,
  budget: TextBudget = "brief",
): { text: string; truncated: boolean; omittedChars: number } {
  const cap = budgetTokens(budget);
  const tokens = estimateTokens(text);
  if (tokens <= cap) return { text, truncated: false, omittedChars: 0 };
  const suffix = budget === "brief" ? TRUNCATION_SUFFIX : FINAL_TRUNCATION_SUFFIX;
  const suffixTokens = estimateTokens(suffix);
  const bodyBudget = Math.max(1, cap - suffixTokens);
  const maxChars = bodyBudget * 4;
  const trimmed = text.slice(0, maxChars);
  return {
    text: trimmed + suffix,
    truncated: true,
    omittedChars: text.length - maxChars,
  };
}

/**
 * Truncate known list fields on an explore-style object before serialization.
 * `unresolvedCallees` (a count plus at most 10 names) is left whole, so the
 * resolved `callees` keep the list budget.
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
  // Full mode sizes source to the full-mode token ceiling (~4500 tokens), so a
  // typical long function arrives whole; its hints cannot point at mode:"full".
  const full = mode === "full";
  const maxCallers = full ? 40 : 12;
  const maxSourceLines = full ? 400 : 40;

  const symbol = value.symbol as Record<string, unknown> | undefined;
  if (symbol && typeof symbol.source === "string") {
    const lines = symbol.source.split("\n");
    if (lines.length > maxSourceLines) {
      const omitted = lines.length - maxSourceLines;
      symbol.source = lines.slice(0, maxSourceLines).join("\n") + "\n…";
      truncated.push({
        field: "symbol.source",
        omitted,
        hint: full
          ? "read the remaining lines from the file by startLine/endLine"
          : 'use mode:"full" or omit source from include',
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
        hint: full
          ? 'use compass_explore with include:["blast_radius"] for the full list'
          : 'use mode:"full" or narrow with include',
      });
    }
  }
}
