import { spawnSync } from "node:child_process";

/**
 * One commit that touched a given path, with the line churn it introduced there.
 *
 * @remarks Binary changes, which git reports as `-` in `--numstat`, are recorded
 *   as `0` added / `0` deleted rather than an invalid number.
 */
export interface CommitTouch {
  /** Full commit SHA. */
  sha: string;
  /** Commit timestamp, in whole seconds since the Unix epoch. */
  ts: number;
  /** Lines added to the path by this commit (`0` for a binary change). */
  added: number;
  /** Lines deleted from the path by this commit (`0` for a binary change). */
  deleted: number;
}

/** A pair of files and the number of commits that touched both of them. */
export interface CoChange {
  /** The lexicographically smaller path of the pair. */
  a: string;
  /** The lexicographically larger path of the pair. */
  b: string;
  /** How many commits in the window touched both `a` and `b`. */
  count: number;
}

/** Result of {@link churn}: per-file change counts plus the shallow-clone marker. */
export interface ChurnResult {
  /** `true` when the repo is a shallow clone, so counts are truncated and unreliable. */
  shallow: boolean;
  /** Map of project-relative path → number of commits in the window that touched it. */
  byPath: Map<string, number>;
}

/** Per-file activity used by hotspot ranking (commits + lines + authors). */
export interface FileActivity {
  /** Commits in the window that touched the path. */
  commits: number;
  /** Sum of lines added across those commits. */
  linesAdded: number;
  /** Sum of lines deleted across those commits. */
  linesDeleted: number;
  /** Distinct author names (`%an`) that touched the path. */
  authors: number;
}

/** Result of {@link fileActivity}: richer per-file activity plus the shallow marker. */
export interface FileActivityResult {
  shallow: boolean;
  byPath: Map<string, FileActivity>;
}

/** Result of {@link coChanges}: co-change pairs plus the shallow-clone marker. */
export interface CoChangeResult {
  /** `true` when the repo is a shallow clone, so counts are truncated and unreliable. */
  shallow: boolean;
  /** The file pairs whose support meets the threshold, each with its commit count. */
  pairs: CoChange[];
  /** Commits skipped because they touched more than `maxFilesPerCommit` files. */
  skippedTooLarge?: number;
  /** Commits whose file lists were considered (after size filter). */
  commitsScanned?: number;
}

/** ASCII NUL — the record/field separator git emits with `-z` and we request via `%x00`. */
const NUL = "\0";

/**
 * Run git in `projectPath` and return stdout, or `null` on any failure.
 *
 * Best-effort like {@link isGitRepo}: git missing, not a repo, or a non-zero
 * exit all yield `null` so callers can fail soft rather than throw.
 */
function git(projectPath: string, args: string[]): string | null {
  // `core.quotePath=false` keeps non-ASCII paths as raw UTF-8 instead of git's
  // default octal-escaped, double-quoted form — so our path parsing stays exact.
  const res = spawnSync("git", ["-C", projectPath, "-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") return null;
  return res.stdout;
}

/** Parse a `--numstat` count field: `-` (binary) becomes `0`, anything non-numeric too. */
function numstat(field: string): number {
  if (field === "-") return 0;
  const n = Number.parseInt(field, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The current `HEAD` commit SHA, or `null` when the repo has no commits yet
 * (or is not a repo / git is unavailable).
 *
 * @param projectPath - Directory inside the work tree to query.
 * @returns The 40-char SHA, or `null`.
 */
export function headSha(projectPath: string): string | null {
  const out = git(projectPath, ["rev-parse", "HEAD"]);
  const sha = out?.trim();
  return sha ? sha : null;
}

/**
 * Whether `projectPath` is inside a shallow clone (e.g. CI's `--depth=1`), where
 * history is truncated and change/coupling counts would be misleadingly low.
 *
 * @param projectPath - Directory inside the work tree to query.
 * @returns `true` only when git reports the repository is shallow.
 */
export function isShallowRepo(projectPath: string): boolean {
  const out = git(projectPath, ["rev-parse", "--is-shallow-repository"]);
  return out?.trim() === "true";
}

/**
 * The commits that touched `relPath`, most-recent first, with the line churn
 * each introduced there.
 *
 * Fail-soft: a path with no history, a repo with no commits, or an unavailable
 * git binary all yield an empty list. Records are parsed over NUL separators, so
 * paths containing spaces or unicode are handled correctly.
 *
 * `since`/`until` bound the history as a **revision range** (`since..until`,
 * `until` defaulting to `HEAD`) — the exact, deterministic form drift needs
 * (`<archived-sha>..HEAD`), not an approximate date window. `since` is exclusive.
 *
 * @param projectPath - Project root to query.
 * @param relPath - Project-relative path whose history to read.
 * @param opts - Optional revision bounds: `since` (exclusive lower bound) and
 *   `until` (upper bound, default `HEAD`) — any revision git accepts, e.g. a SHA.
 * @returns The touching commits, newest first; empty when there is no history.
 */
export function logForPath(
  projectPath: string,
  relPath: string,
  opts: { since?: string; until?: string } = {},
): CommitTouch[] {
  const range: string[] = [];
  if (opts.since) range.push(`${opts.since}..${opts.until ?? "HEAD"}`);
  else if (opts.until) range.push(opts.until);
  // Per commit: <sha>\0<ts>\0 then one numstat line per file it touched.
  const out = git(projectPath, [
    "log",
    "--format=%x00%H%x00%ct%x00",
    "--numstat",
    ...range,
    "--",
    relPath,
  ]);
  if (out === null) return [];

  const touches: CommitTouch[] = [];
  // The stream is a sequence of "\0<sha>\0<ts>\0<numstat lines>" per commit.
  const records = out.split(NUL);
  // records[0] is empty (leading NUL); then repeating [sha, ts, tail...] where
  // `tail` holds the numstat lines for that commit up to the next leading NUL.
  for (let i = 1; i + 1 < records.length; i += 3) {
    const sha = records[i]?.trim();
    const ts = Number.parseInt(records[i + 1] ?? "", 10);
    const tail = records[i + 2] ?? "";
    if (!sha || !Number.isFinite(ts)) continue;
    let added = 0;
    let deleted = 0;
    for (const line of tail.split("\n")) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;
      added += numstat(cols[0]!);
      deleted += numstat(cols[1]!);
    }
    touches.push({ sha, ts, added, deleted });
  }
  return touches;
}

/**
 * How many commits touched each file in the window, summed from `--numstat`.
 *
 * Fail-soft: yields an empty map on any git failure. Does not follow renames —
 * a renamed file is counted under its path as it appears in each commit (a safe
 * superset, not a precise lineage). The result carries the {@link isShallowRepo}
 * marker so consumers can degrade to "insufficient data" on a shallow clone.
 *
 * @param projectPath - Project root to query.
 * @param opts - Optional `since` window (any date/revision git accepts) and a
 *   `pathspec` list to restrict which paths are considered.
 * @returns Per-path change counts and the shallow marker.
 */
export function churn(
  projectPath: string,
  opts: { since?: string; pathspec?: string[] } = {},
): ChurnResult {
  const shallow = isShallowRepo(projectPath);
  const args = ["log", "--numstat", "--format=%x00"];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.pathspec && opts.pathspec.length > 0) args.push("--", ...opts.pathspec);
  const out = git(projectPath, args);
  const byPath = new Map<string, number>();
  if (out === null) return { shallow, byPath };

  for (const line of out.split("\n")) {
    // Numstat rows are "<added>\t<deleted>\t<path>"; the %x00 format lines and
    // blank lines have no tabs and are skipped.
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const path = cols[2]!.replace(/^\0+/, "").trim();
    if (!path) continue;
    byPath.set(path, (byPath.get(path) ?? 0) + 1);
  }
  return { shallow, byPath };
}

/**
 * Richer per-file activity (commits, lines added/deleted, distinct authors).
 *
 * Fail-soft and shallow-aware like {@link churn}. Does not follow renames.
 * Suitable for hotspot ranking; existing {@link churn} callers stay on commit counts.
 *
 * @param projectPath - Project root to query.
 * @param opts - Optional `since` window and `pathspec` filter.
 */
export function fileActivity(
  projectPath: string,
  opts: { since?: string; pathspec?: string[] } = {},
): FileActivityResult {
  const shallow = isShallowRepo(projectPath);
  // Per commit: \0<author>\0 then numstat lines until the next leading NUL.
  const args = ["log", "--numstat", "--format=%x00%an%x00"];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.pathspec && opts.pathspec.length > 0) args.push("--", ...opts.pathspec);
  const out = git(projectPath, args);
  const byPath = new Map<string, FileActivity>();
  const authorsByPath = new Map<string, Set<string>>();
  if (out === null) return { shallow, byPath };

  const records = out.split(NUL);
  for (let i = 1; i + 1 < records.length; i += 2) {
    const author = (records[i] ?? "").trim();
    const tail = records[i + 1] ?? "";
    if (!author && !tail.trim()) continue;
    for (const line of tail.split("\n")) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;
      const path = cols[2]!.replace(/^\0+/, "").trim();
      if (!path) continue;
      const added = numstat(cols[0]!);
      const deleted = numstat(cols[1]!);
      const cur = byPath.get(path) ?? { commits: 0, linesAdded: 0, linesDeleted: 0, authors: 0 };
      cur.commits += 1;
      cur.linesAdded += added;
      cur.linesDeleted += deleted;
      byPath.set(path, cur);
      if (author) {
        let set = authorsByPath.get(path);
        if (!set) {
          set = new Set();
          authorsByPath.set(path, set);
        }
        set.add(author);
      }
    }
  }
  for (const [path, act] of byPath) {
    act.authors = authorsByPath.get(path)?.size ?? 0;
  }
  return { shallow, byPath };
}

/**
 * Jaccard-style coupling strength: `both / (commitsA + commitsB - both)`.
 * Returns `0` when the denominator is zero.
 */
export function jaccardStrength(both: number, commitsA: number, commitsB: number): number {
  const denom = commitsA + commitsB - both;
  if (denom <= 0) return 0;
  return both / denom;
}

/**
 * For every pair of files that changed together, how many commits touched both.
 *
 * Groups each commit's changed files and emits a count per unordered pair. Pairs
 * with fewer than `minSupport` shared commits are omitted. Commits that touch
 * more than `maxFilesPerCommit` files (when set) are skipped and counted in
 * `skippedTooLarge`. Fail-soft (empty on git failure) and does not follow
 * renames. Carries the shallow marker.
 *
 * @param projectPath - Project root to query.
 * @param opts - Optional `since` window, `minSupport` (default `1`), and
 *   `maxFilesPerCommit` (omit to keep all commits).
 * @returns The qualifying co-change pairs and the shallow marker.
 */
export function coChanges(
  projectPath: string,
  opts: { since?: string; minSupport?: number; maxFilesPerCommit?: number } = {},
): CoChangeResult {
  const shallow = isShallowRepo(projectPath);
  const minSupport = opts.minSupport ?? 1;
  const maxFiles = opts.maxFilesPerCommit;
  const args = ["log", "--name-only", "--format=%x00"];
  if (opts.since) args.push(`--since=${opts.since}`);
  const out = git(projectPath, args);
  if (out === null) return { shallow, pairs: [], skippedTooLarge: 0, commitsScanned: 0 };

  const counts = new Map<string, number>();
  let skippedTooLarge = 0;
  let commitsScanned = 0;
  // Each commit's file list is the run of lines between two %x00 markers.
  for (const commitBlock of out.split(NUL)) {
    const files = commitBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (files.length === 0) continue;
    const unique = [...new Set(files)].sort();
    if (maxFiles !== undefined && unique.length > maxFiles) {
      skippedTooLarge++;
      continue;
    }
    commitsScanned++;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${unique[i]}\t${unique[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: CoChange[] = [];
  for (const [key, count] of counts) {
    if (count < minSupport) continue;
    const [a, b] = key.split("\t");
    pairs.push({ a: a!, b: b!, count });
  }
  pairs.sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { shallow, pairs, skippedTooLarge, commitsScanned };
}

/**
 * The SHA of the most recent commit that touched `relPath`, or `null` when the
 * path has no history (or on any git failure).
 *
 * @param projectPath - Project root to query.
 * @param relPath - Project-relative path.
 * @returns The last-touching commit SHA, or `null`.
 */
export function lastTouch(projectPath: string, relPath: string): string | null {
  const out = git(projectPath, ["log", "-1", "--format=%H", "--", relPath]);
  const sha = out?.trim();
  return sha ? sha : null;
}
