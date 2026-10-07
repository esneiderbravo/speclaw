// JSON that speclaw writes into committed paths (lawbook/) must survive a host
// repo's `prettier --check .`. Prettier keeps an object expanded when it was
// written expanded, but collapses an array onto one line whenever it fits the
// print width — so `JSON.stringify(v, null, 2)` arrays like `["a"]` fail it.

const PRINT_WIDTH = 100;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** True for a non-empty array or object, which Prettier never prints flat inside an array. */
function isNonEmptyObject(v: Json): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0;
}

/** Prettier breaks an array of two or more arrays that each hold two or more elements. */
function mustBreak(arr: Json[]): boolean {
  return arr.length > 1 && arr.every((e) => Array.isArray(e) && e.length > 1);
}

/** The one-line form of a value, or null when Prettier would never print it flat. */
function flat(v: Json): string | null {
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (mustBreak(v) || v.some(isNonEmptyObject)) return null;
    const parts = v.map(flat);
    if (parts.some((p) => p === null)) return null;
    return `[${parts.join(", ")}]`;
  }
  if (typeof v === "object" && v !== null) return Object.keys(v).length === 0 ? "{}" : null;
  return JSON.stringify(v);
}

function render(v: Json, depth: number, prefix: string, comma: boolean): string {
  const pad = "  ".repeat(depth);
  const tail = comma ? "," : "";
  const one = flat(v);
  if (one !== null && (!Array.isArray(v) || (pad + prefix + one + tail).length <= PRINT_WIDTH)) {
    return pad + prefix + one + tail;
  }
  if (Array.isArray(v)) {
    if (v.every((e) => typeof e === "number")) {
      // Prettier fills number arrays: as many per line as fit.
      const inner = "  ".repeat(depth + 1);
      const rows: string[] = [];
      let row = "";
      v.forEach((n, i) => {
        const item = JSON.stringify(n) + (i < v.length - 1 ? "," : "");
        if (row && (inner + row + " " + item).length > PRINT_WIDTH) {
          rows.push(inner + row);
          row = item;
        } else row = row ? `${row} ${item}` : item;
      });
      rows.push(inner + row);
      return `${pad}${prefix}[\n${rows.join("\n")}\n${pad}]${tail}`;
    }
    const items = v.map((e, i) => render(e, depth + 1, "", i < v.length - 1));
    return `${pad}${prefix}[\n${items.join("\n")}\n${pad}]${tail}`;
  }
  const entries = Object.entries(v as Record<string, Json>);
  const props = entries.map(([k, val], i) =>
    render(val, depth + 1, `${JSON.stringify(k)}: `, i < entries.length - 1),
  );
  return `${pad}${prefix}{\n${props.join("\n")}\n${pad}}${tail}`;
}

/**
 * Serialize a value as 2-space JSON in the layout Prettier gives it, so files
 * speclaw writes into a host repo stay green under `prettier --check`.
 *
 * @remarks
 * Objects stay expanded (as `JSON.stringify` writes them); arrays go on one
 * line when they fit in 100 columns and hold no non-empty object. Values are
 * normalized through `JSON.stringify` first, so `undefined` fields drop out and
 * `toJSON` applies exactly as before.
 *
 * @param value - Any JSON-serializable value.
 * @returns The formatted JSON text with a trailing newline.
 */
export function formatJson(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value)) as Json;
  return render(normalized, 0, "", false) + "\n";
}
