/** Parsed CLI flags: named options plus positional arguments in `_`. */
export interface Flags {
  _: string[];
  [key: string]: string | boolean | string[];
}

/**
 * Minimal flag parser: `--key value`, `--key=value`, `--bool`, `-x`. A repeated
 * key keeps its last value unless it is listed in `repeatable`.
 *
 * @param argv - Raw argument tokens (already stripped of the command name).
 * @param repeatable - Keys whose every value is kept: such a key always yields a
 *   `string[]` in argv order, and its values are never split at commas.
 * @returns Flags with named options set and non-flag tokens collected in `_`.
 */
export function parseFlags(argv: string[], repeatable: readonly string[] = []): Flags {
  const flags: Flags = { _: [] };
  const set = (key: string, value: string | true): void => {
    const prev = flags[key];
    if (repeatable.includes(key) && (typeof value === "string" || Array.isArray(prev))) {
      // A bare repeatable flag after real values adds nothing and drops nothing.
      if (typeof value === "string") flags[key] = Array.isArray(prev) ? [...prev, value] : [value];
    } else {
      flags[key] = value;
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [key, inlineVal] = arg.slice(2).split("=", 2);
      if (inlineVal !== undefined) {
        set(key!, inlineVal);
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        set(key!, argv[++i]!);
      } else {
        set(key!, true);
      }
    } else if (arg.startsWith("-")) {
      flags[arg.slice(1)] = true;
    } else {
      (flags._ as string[]).push(arg);
    }
  }
  return flags;
}

/** Flags that may be passed more than once; each occurrence is one value. */
export const REPEATABLE_FLAGS: readonly string[] = ["question"];

/**
 * The values of a repeatable flag parsed with {@link REPEATABLE_FLAGS}, as-is:
 * in argv order and never split at commas.
 *
 * @param value - The parsed flag value.
 * @returns The string values; empty when the flag is absent or a bare boolean.
 */
export function repeated(value: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Normalize a flag value into a list, splitting comma-separated strings.
 *
 * @param value - A flag value that may be an array, a comma-separated string, or absent.
 * @returns The trimmed, non-empty entries; empty when the value is missing or a boolean.
 */
export function list(value: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string")
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}
