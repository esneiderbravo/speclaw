import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mergeBase } from "../../shared/git.js";
import { isTestPath, loadAffectedConfig } from "../compass/affected-config.js";

/**
 * Lines that declare an HTTP route or a request/response contract, across the
 * frameworks a repo is likely to use. A diff line matching one of them adds,
 * changes or removes an endpoint, so the change owes an API report. Lines are
 * trimmed; decorators must open the line, as they do in code, so a string or a
 * regex that merely mentions one is not a route.
 */
const ROUTE_LINE: RegExp[] = [
  // NestJS controllers and handlers.
  /^@(Controller|Get|Post|Put|Patch|Delete|Head|Options|All|HttpCode|Header|Redirect|Sse)\s*\(/,
  // Spring.
  /^@(RestController|RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\b/,
  // FastAPI, Flask and similar decorator routers.
  /^@\w+\.(get|post|put|patch|delete|route|api_route|websocket)\s*\(/,
  // Express, Koa, Fastify, Hono: `router.get("/x", handler)` — a path and a
  // handler, so a client call (`api.get("/users")`) or `app.get("port")` is not one.
  /^(\w+\.)?(app|router|server|fastify|routes?)\.(get|post|put|patch|delete|all)\s*\(\s*["'`]\/[^"'`]*["'`]\s*,/,
  // Go net/http, gin, echo, chi: `r.GET("/x", …)`, `mux.HandleFunc("/x", …)`.
  /^\w+\.(GET|POST|PUT|PATCH|DELETE|HandleFunc|Handle)\s*\(\s*"\//,
];

/** Next.js App Router handlers: an exported HTTP-verb function in a `route.*` file. */
const NEXT_ROUTE_FILE = /(^|\/)app\/(.+\/)?route\.[cm]?[jt]sx?$/;
const NEXT_HANDLER =
  /export\s+(async\s+)?(function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

/** Files that are the contract themselves: any change to them is an API change. */
const CONTRACT_FILE = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$|\.(proto|graphql|gql)$/i;

/** Request/response shapes: a code (not comment) change in a DTO file. */
const DTO_FILE = /(^|\/)dtos?\/|\.dto\.[cm]?[jt]s$|(^|\/)schemas?\/.+\.py$/;
const COMMENT_OR_BLANK = /^\s*(\/\/|\/\*|\*|#|$)/;

/** One changed file that touches the API surface, with the lines that show it. */
export interface ApiSurfaceHit {
  file: string;
  /** Changed lines that declare the surface (trimmed, at most a few per file). */
  lines: string[];
}

const LINES_PER_FILE = 4;

/**
 * The changed files whose diff against the branch base adds, changes or
 * removes an API surface: a route declaration, a contract file, or a DTO. Test
 * files never count. Reads one `git diff -U0` for every candidate at once and
 * untracked files whole; never throws.
 *
 * @param projectPath - Project root (a git repository).
 * @param files - Changed files, relative to the root.
 * @returns The files that touch the API surface, in the order given.
 */
export function apiSurfaceChanges(projectPath: string, files: string[]): ApiSurfaceHit[] {
  try {
    const { testGlobs } = loadAffectedConfig(projectPath);
    const candidates = files.filter((f) => !isTestPath(f, testGlobs));
    if (candidates.length === 0) return [];
    const changed = changedLines(projectPath, candidates);
    const hits: ApiSurfaceHit[] = [];
    for (const file of candidates) {
      const lines = changed.get(file) ?? [];
      if (CONTRACT_FILE.test(file)) {
        hits.push({ file, lines: [] });
        continue;
      }
      const surface = lines.filter((l) => declaresSurface(file, l));
      if (surface.length) hits.push({ file, lines: surface.slice(0, LINES_PER_FILE) });
    }
    return hits;
  } catch {
    return [];
  }
}

function declaresSurface(file: string, line: string): boolean {
  if (ROUTE_LINE.some((re) => re.test(line))) return true;
  if (NEXT_ROUTE_FILE.test(file) && NEXT_HANDLER.test(line)) return true;
  return DTO_FILE.test(file) && !COMMENT_OR_BLANK.test(line);
}

/**
 * Added and removed lines per file against the merge base with `main`/`master`
 * (working tree included); an untracked file contributes every line.
 */
function changedLines(projectPath: string, files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const base = mergeBase(projectPath, "main") ?? mergeBase(projectPath, "master");
  if (base) {
    const r = spawnSync(
      "git",
      [
        "-c",
        "core.quotePath=false",
        "diff",
        "-U0",
        "--no-color",
        "--no-ext-diff",
        "--no-renames",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        base,
        "--",
        ...files,
      ],
      { cwd: projectPath, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    let current: string | null = null;
    for (const line of (r.status === 0 ? r.stdout : "").split("\n")) {
      // A path with a space ends its header with a tab.
      const head = /^(---|\+\+\+) (?:[ab]\/(.+?)|\/dev\/null)\t?$/.exec(line);
      if (head) {
        // A deleted file's `+++ /dev/null` keeps the name its `--- a/` line set.
        if (head[2]) current = head[2];
        else if (head[1] === "---") current = null;
        continue;
      }
      if (current && /^[+-](?![+-]{2} )/.test(line)) {
        out.set(current, [...(out.get(current) ?? []), line.slice(1).trim()]);
      }
    }
  }
  const untracked = spawnSync(
    "git",
    ["-c", "core.quotePath=false", "ls-files", "--others", "--exclude-standard", "--", ...files],
    { cwd: projectPath, encoding: "utf8" },
  );
  for (const f of (untracked.status === 0 ? untracked.stdout : "").split("\n")) {
    if (!f || out.has(f)) continue;
    try {
      out.set(
        f,
        fs
          .readFileSync(path.join(projectPath, f), "utf8")
          .split("\n")
          .map((l) => l.trim()),
      );
    } catch {
      // Vanished since it was listed: nothing to read.
    }
  }
  return out;
}
