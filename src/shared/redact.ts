import os from "node:os";
import path from "node:path";

/**
 * Replace every occurrence of `from` that sits on a path boundary (not as a
 * substring of a longer path). Prevents `/home/runner` from mangling
 * `/opt/home/runner/...` into `/opt~/...` on GitHub Actions.
 */
function replacePathToken(text: string, from: string, to: string): string {
  if (!from || from.length < 2) return text;
  let out = text;
  let idx = 0;
  while ((idx = out.indexOf(from, idx)) !== -1) {
    const before = idx === 0 ? "" : out[idx - 1]!;
    const afterIdx = idx + from.length;
    const after = afterIdx >= out.length ? "" : out[afterIdx]!;
    // Preceding char must not continue a path segment (blocks /opt + /home/…).
    const beforeOk = idx === 0 || !/[A-Za-z0-9._-]/.test(before);
    // Following char must end the token or continue as a separator.
    const afterOk = after === "" || after === "/" || after === "\\" || /[\s'",):]/.test(after);
    if (beforeOk && afterOk) {
      out = out.slice(0, idx) + to + out.slice(afterIdx);
      idx += to.length;
    } else {
      idx += 1;
    }
  }
  return out;
}

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
  const queueReplacement = (from: string, to: string) => {
    if (from && from.length > 1) replacements.push([from, to]);
  };

  queueReplacement(path.resolve(projectPath), "<project>");
  queueReplacement(projectPath.replace(/\//g, "\\"), "<project>");
  queueReplacement(home, "~");
  queueReplacement(home.replace(/\//g, "\\"), "~");
  queueReplacement(`C:\\Users\\${user}`, "~");
  queueReplacement(`c:\\Users\\${user}`, "~");

  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of replacements) {
    out = replacePathToken(out, from, to);
    if (from.includes("\\")) out = replacePathToken(out, from.replace(/\\/g, "/"), to);
  }

  if (user && user.length > 1) {
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
