const VAR_RE = /\{\{([a-z_]+)\}\}/g;

/** Outcome of a {@link render} call. */
export interface RenderResult {
  /** The content with all resolvable {{var}} placeholders substituted. */
  output: string;
  /** Names of placeholders that had no value in `vars` and were left as-is. */
  unresolved: Set<string>;
}

/**
 * Replace {{var}} placeholders with values from `vars`. Unknown placeholders
 * are left untouched and reported so the agent can fill them in later.
 *
 * @param content - Template text containing `{{name}}` placeholders.
 * @param vars - Lookup of placeholder names to values; `undefined` values are treated as unresolved.
 * @returns The rendered output alongside the set of placeholder names that could not be resolved.
 */
export function render(
  content: string,
  vars: Record<string, string | undefined>
): RenderResult {
  const unresolved = new Set<string>();
  const output = content.replace(VAR_RE, (match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      unresolved.add(name);
      return match;
    }
    return value;
  });
  return { output, unresolved };
}
