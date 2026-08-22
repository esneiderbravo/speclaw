import os from "node:os";
import path from "node:path";

/**
 * Redact absolute paths and usernames so a doctor report is safe to paste into
 * a public issue. Home becomes `~`, the project root becomes `<project>`, and
 * OS usernames are scrubbed from path segments.
 *
 * @param text - Arbitrary detail / remedy text that may contain paths.
 * @param projectPath - Absolute project root to replace with `<project>`.
 * @returns Redacted text (POSIX and Windows separators handled).
 */
export function redactText(text: string, projectPath: string): string {
  let out = text;
  const home = os.homedir();
  const user = os.userInfo().username;

  const replacements: Array<[string, string]> = [];
  const push = (from: string, to: string) => {
    if (from && from.length > 1) replacements.push([from, to]);
  };

  push(path.resolve(projectPath), "<project>");
  push(projectPath.replace(/\//g, "\\"), "<project>");
  push(home, "~");
  push(home.replace(/\//g, "\\"), "~");
  // Windows-style home without drive letter variants
  push(`C:\\Users\\${user}`, "~");
  push(`c:\\Users\\${user}`, "~");

  // Longest first so nested prefixes don't leave residues.
  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
    if (from.includes("\\")) out = out.split(from.replace(/\\/g, "/")).join(to);
  }

  if (user && user.length > 1) {
    // Path segment scrub — avoid eating the username inside unrelated words.
    const seg = new RegExp(`(^|[/\\\\])${escapeRegExp(user)}(?=[/\\\\]|$)`, "gi");
    out = out.replace(seg, `$1<user>`);
  }

  return out;
}

/**
 * Deep-redact every string field in a JSON-compatible value.
 *
 * @param value - Report fragment.
 * @param projectPath - Project root for `<project>` substitution.
 */
export function redactValue<T>(value: T, projectPath: string): T {
  if (typeof value === "string") return redactText(value, projectPath) as T;
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, projectPath)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, projectPath);
    }
    return out as T;
  }
  return value;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
