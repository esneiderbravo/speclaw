import {
  churn,
  coChanges,
  headSha,
  type ChurnResult,
  type CoChange,
  type CoChangeResult,
} from "../../shared/git-history.js";
import { openDb } from "./db.js";

/**
 * Read-through cache over the expensive git-history scans (`churn`,
 * `coChanges`), persisted in Compass's `.speclaw/index.db`.
 *
 * The scans walk the whole history window, so their cost is worth memoizing —
 * but only until a new commit lands. Each entry is keyed by the query (function
 * name + normalized options) and stamped with the `HEAD` SHA it was computed at;
 * a cached result is reused only while `HEAD` is unchanged, and recomputed
 * otherwise. The single-path reads (`logForPath`, `lastTouch`) are cheap and are
 * called directly, uncached.
 *
 * This wrapper lives in the compass module because persistence belongs with the
 * database it owns; the {@link churn}/{@link coChanges} engine in
 * `src/shared/git-history.ts` stays pure and imports nothing from `modules/`.
 */

/** The serialized shape stored in `git_history_cache.payload` for a churn result. */
interface ChurnPayload {
  shallow: boolean;
  byPath: [string, number][];
}

/** A row of the `git_history_cache` table. */
interface CacheRow {
  head_sha: string;
  payload: string;
}

/**
 * Look up a cached payload valid at the current HEAD, or compute it and store it.
 *
 * When `head` is `null` (no commits / not a repo) the cache is bypassed entirely
 * and `compute()` runs directly, so an empty repo never poisons the cache.
 *
 * @param projectPath - Project root, whose `.speclaw/index.db` holds the cache.
 * @param head - The current HEAD SHA, or `null` when there is none.
 * @param queryKey - Stable key identifying this query (function + options).
 * @param compute - Produces the fresh result on a miss.
 * @param serialize - Turns the result into a JSON-safe payload string.
 * @param deserialize - Rebuilds the result from a stored payload string.
 * @returns The cached-or-freshly-computed result.
 */
function readThrough<T>(
  projectPath: string,
  head: string | null,
  queryKey: string,
  compute: () => T,
  serialize: (value: T) => string,
  deserialize: (payload: string) => T,
): T {
  if (head === null) return compute();

  const db = openDb(projectPath);
  try {
    const row = db
      .prepare("SELECT head_sha, payload FROM git_history_cache WHERE query_key = ?")
      .get(queryKey) as CacheRow | undefined;
    if (row && row.head_sha === head) {
      return deserialize(row.payload);
    }

    const value = compute();
    db.prepare(
      `INSERT INTO git_history_cache(query_key, head_sha, payload, computed_at)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(query_key) DO UPDATE SET
         head_sha = excluded.head_sha,
         payload = excluded.payload,
         computed_at = excluded.computed_at`,
    ).run(queryKey, head, serialize(value));
    return value;
  } finally {
    db.close();
  }
}

/**
 * {@link churn}, memoized in the Compass index until `HEAD` moves.
 *
 * @param projectPath - Project root to query.
 * @param opts - Same options as {@link churn}.
 * @returns Per-path change counts and the shallow marker, cached per HEAD.
 */
export function cachedChurn(
  projectPath: string,
  opts: { since?: string; pathspec?: string[] } = {},
): ChurnResult {
  const key = `churn:${JSON.stringify({ since: opts.since ?? null, pathspec: opts.pathspec ?? null })}`;
  return readThrough<ChurnResult>(
    projectPath,
    headSha(projectPath),
    key,
    () => churn(projectPath, opts),
    (value) =>
      JSON.stringify({ shallow: value.shallow, byPath: [...value.byPath] } satisfies ChurnPayload),
    (payload) => {
      const parsed = JSON.parse(payload) as ChurnPayload;
      return { shallow: parsed.shallow, byPath: new Map(parsed.byPath) };
    },
  );
}

/**
 * {@link coChanges}, memoized in the Compass index until `HEAD` moves.
 *
 * @param projectPath - Project root to query.
 * @param opts - Same options as {@link coChanges}.
 * @returns The co-change pairs and the shallow marker, cached per HEAD.
 */
export function cachedCoChanges(
  projectPath: string,
  opts: { since?: string; minSupport?: number } = {},
): CoChangeResult {
  const key = `coChanges:${JSON.stringify({ since: opts.since ?? null, minSupport: opts.minSupport ?? null })}`;
  return readThrough<CoChangeResult>(
    projectPath,
    headSha(projectPath),
    key,
    () => coChanges(projectPath, opts),
    (value) => JSON.stringify(value),
    (payload) => JSON.parse(payload) as { shallow: boolean; pairs: CoChange[] },
  );
}
