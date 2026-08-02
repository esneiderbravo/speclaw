/** Parsed CLI flags: named options plus positional arguments in `_`. */
export interface Flags {
  _: string[];
  [key: string]: string | boolean | string[];
}

/**
 * Minimal flag parser: `--key value`, `--key=value`, `--bool`, `-x`.
 *
 * @param argv - Raw argument tokens (already stripped of the command name).
 * @returns Flags with named options set and non-flag tokens collected in `_`.
 */
export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [key, inlineVal] = arg.slice(2).split("=", 2);
      if (inlineVal !== undefined) {
        flags[key!] = inlineVal;
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        flags[key!] = argv[++i]!;
      } else {
        flags[key!] = true;
      }
    } else if (arg.startsWith("-")) {
      flags[arg.slice(1)] = true;
    } else {
      (flags._ as string[]).push(arg);
    }
  }
  return flags;
}

/**
 * Normalize a flag value into a list, splitting comma-separated strings.
 *
 * @param value - A flag value that may be an array, a comma-separated string, or absent.
 * @returns The trimmed, non-empty entries; empty when the value is missing or a boolean.
 */
export function list(value: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
