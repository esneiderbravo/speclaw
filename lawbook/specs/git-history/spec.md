# Git History

The shared read layer over a repository's git history: a pure, fail-soft engine
that answers questions about the **past** of the code (per-file change history,
change frequency, co-change coupling, last touch) plus a persistent HEAD-keyed
cache for its expensive full-history scans. It is enabling infrastructure with
no user-facing surface — no MCP tool, no CLI command — consumed by higher-level
features (drift, trace, hotspots-coupling). The engine lives in
`src/shared/git-history.ts`; the cache lives in the compass module, which owns
`.speclaw/index.db`.

### Requirement: Per-file change history

The system SHALL expose `logForPath(projectPath, relPath, opts?)` returning the
commits that touched a path — each entry carrying its SHA, commit timestamp, and
lines added and deleted — ordered most-recent first. It SHALL accept an optional
`since`/`until` **revision range** (`since..until`, `until` defaulting to `HEAD`,
`since` exclusive) so a consumer can ask "what touched this path since a given
commit" — the exact, deterministic form drift needs. It SHALL be fail-soft: a
path with no history, a repo with no commits, or an unavailable git binary
yields an empty list, never a throw.

#### Scenario: A path with history
- Given a repo with three commits that each touch `src/a.ts`
- When `logForPath(repo, "src/a.ts")` is called
- Then it returns three entries, most-recent first, each with `sha`, `ts`,
  `added`, and `deleted`

#### Scenario: A path with no history
- Given a path that has never existed in the repo
- When `logForPath` is called for that path
- Then it returns an empty list and does not throw

#### Scenario: A bounded revision range
- Given a repo whose first commit touching `src/a.ts` has SHA `first`, followed
  by two later commits that also touch it
- When `logForPath(repo, "src/a.ts", { since: first })` is called
- Then only the two commits after `first` are returned, most-recent first
  (`first` itself is excluded)

### Requirement: Change frequency

The system SHALL expose `churn(projectPath, opts?)` returning, for each file, the
count of changes across the queried window, summed from `git log --numstat`, and
accepting an optional `since` window and `pathspec` filter. Binary files, which
git reports as `-` in `--numstat`, SHALL be counted as zero added/deleted rather
than producing an invalid number. The result SHALL carry a `shallow` marker (see
"Shallow-clone detection"). It SHALL be fail-soft.

#### Scenario: Summed change counts
- Given a repo where `src/a.ts` changed in three commits and `src/b.ts` in one
- When `churn(repo)` is called
- Then the result maps `src/a.ts` to three and `src/b.ts` to one

#### Scenario: Binary files do not corrupt the sum
- Given a commit that changes a binary file (reported as `-\t-` by numstat)
- When `churn(repo)` is called
- Then the binary file's contribution is zero and no entry is `NaN`

### Requirement: Co-change coupling

The system SHALL expose `coChanges(projectPath, opts?)` returning, for each pair
of files, the number of commits that touched both, accepting an optional `since`
window and a `minSupport` threshold below which pairs are omitted. The result
SHALL carry a `shallow` marker. It SHALL be fail-soft.

#### Scenario: Files that change together
- Given a repo where `src/a.ts` and `src/b.ts` are touched together in two
  commits and `src/a.ts` alone in one
- When `coChanges(repo)` is called
- Then the pair `(src/a.ts, src/b.ts)` has a count of two

#### Scenario: Minimum support filters weak pairs
- Given a pair that co-occurs in only one commit
- When `coChanges(repo, { minSupport: 2 })` is called
- Then that pair is absent from the result

### Requirement: Last touch

The system SHALL expose `lastTouch(projectPath, relPath)` returning the SHA of
the most recent commit that touched a path, or `null` when the path has no
history. It SHALL be fail-soft.

#### Scenario: Path with history
- Given a repo whose latest commit touching `src/a.ts` has a known SHA
- When `lastTouch(repo, "src/a.ts")` is called
- Then it returns that SHA

#### Scenario: Path with no history
- Given a path that has never existed in the repo
- When `lastTouch` is called
- Then it returns `null`

### Requirement: Shallow-clone detection

The system SHALL detect when a repository is a shallow clone (via
`git rev-parse --is-shallow-repository`) and the aggregate scans `churn` and
`coChanges` MUST set `shallow: true` on their result so consumers can degrade to
"insufficient data" rather than trusting truncated counts.

#### Scenario: A shallow clone is flagged
- Given a repository cloned with `--depth=1`
- When `churn(repo)` or `coChanges(repo)` is called
- Then the result carries `shallow: true`

#### Scenario: A full clone is not flagged
- Given a repository with its full history present
- When `churn(repo)` or `coChanges(repo)` is called
- Then the result carries `shallow: false`

### Requirement: Robust parsing of git output

The engine SHALL parse git output using NUL separators (`-z` / `%x00`) and SHALL
NOT split records on newlines or whitespace, so that paths containing spaces or
unicode are handled correctly. Every git invocation SHALL scope to the project
with `-C <projectPath>` and separate paths with `--`.

#### Scenario: A path containing a space
- Given a repo containing and committing a file whose path has a space
- When `logForPath` or `churn` is called
- Then the file is reported under its exact path, not split into fragments

### Requirement: Persistent HEAD-keyed cache for expensive scans

The system SHALL cache the results of `churn` and `coChanges` in Compass's
`.speclaw/index.db`, keyed by the query and the current `HEAD` SHA, and SHALL
recompute only when `HEAD` has moved since the cached result. The cache SHALL
live in the compass module (which owns the database); the engine in
`src/shared/git-history.ts` SHALL remain pure and MUST NOT import the compass
module, preserving the inward-dependency rule. The cache table SHALL be part of
the versioned schema and SHALL be dropped and rebuilt on a schema reset like the
other index tables.

#### Scenario: A repeated query at the same HEAD is served from cache
- Given a `churn` result computed and cached at the current `HEAD`
- When the same query is issued again without any new commit
- Then the cached result is returned without recomputing from git

#### Scenario: A new commit invalidates the cache
- Given a cached `churn` result at some `HEAD`
- When a new commit is made and the same query is issued
- Then the result is recomputed against the new `HEAD` and the cache is updated

### Requirement: No user-facing surface

This layer SHALL NOT add or modify any MCP tool or CLI command; it is consumed
only in-process by other modules.

#### Scenario: Transports are unchanged
- Given the change is applied
- When the MCP tool set and CLI command set are enumerated
- Then they are identical to before the change
