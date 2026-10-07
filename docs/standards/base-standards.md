# Base Standards — speclaw

Cross-cutting rules that apply to **all** code in this repository, regardless
of layer or language. This is a law of the project — see [`../../LAWS.md`](../../LAWS.md).

## Languages

The working language is **inferred from this repo's own conventions** — the
language already used in docstrings, commit messages, branch names, and PR/ticket
bodies. Match what the repo does; do not impose a language it doesn't use.

- **Code, identifiers, comments, docstrings, commit messages, PR titles/bodies,
  and technical docs**: the repo's artifact language (English unless the repo
  clearly uses another).
- **User-facing product copy**: as the product requires.
- **Agent ↔ human communication** (review comments, thread replies): the same
  language the team already uses in the repo's tickets and PRs. Technical terms
  stay in English within that prose — don't force-translate them.

## Commits & branches

- **Branch naming**: `<type>/<short-slug>` — the type mirrors the commit type
  (`feat/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`). No ticket prefix; speclaw
  prescribes no tracker. Branch from `main`.
- **Commit style**: Conventional Commits — `type(scope): imperative summary`,
  English, lowercase. Types in use: `feat`, `fix`, `docs`, `chore`, `ci`,
  `test`; scopes name the area (`init`, `compass`, `cortex`, `lawbook`,
  `foundation`, `cli`, `drift`, `release`, `publish`). Examples:
  `fix(init): create only .agents/, never prompt for agents`,
  `feat(compass): reindex each file an agent edits`,
  `chore(release): bump to 2.0.15`.
- One focused change per branch; the smallest correct diff. No drive-by
  refactors mixed into a feature branch.

## Comments & documentation

- Comments state **constraints the code cannot express** (invariants, tricky
  edge cases, "why"). They never narrate history, restate the next line, or
  address the reviewer.
- **Never** put ticket IDs, ticket text, or changelog narration
  ("added for TICKET-123", "fixed as part of…") in code or docstrings.
  Traceability lives in the branch name, PR, and git history.

## Dependencies

- Any new dependency must be justified in the PR description. Unannounced
  dependencies are a blocking finding.
- Prefer the standard library and existing project utilities before adding a
  package.

## Engineering principles

- Code reads like its neighbors (naming, structure, idioms).
- Report outcomes faithfully: if a gate fails, say so with the output; never
  claim a success you did not observe.
- Ask before irreversible or outward-facing actions (destructive commands;
  writing to a real data store — DB rows or files holding real user data,
  including to set up or tear down test data; publishing reviews/tickets/comments).

## speclaw-specific base rules

- **Working language is English** — every commit, branch, PR, docstring,
  comment, changelog entry, and doc in this repo is English. Match it.
- **Local-first, no new runtime surface.** No dependency that requires a network
  call, cloud service, LLM, API key, or native build at runtime (see the
  project-specific laws in [`../../LAWS.md`](../../LAWS.md)). Parsers are WASM;
  storage is `node:sqlite`.
- **Node ≥22.16, ESM only.** Relative imports carry explicit `.js` extensions;
  the package is `"type": "module"` with `Node16` resolution.
- **Assets flow through the build.** Anything under `src/**/assets/` must be
  copied by `scripts/copy-assets.mjs` — never hand-place files in `dist/`.
- **No secrets in the repo.** Never commit a `.env` file or a token
  (`law~no-secrets-in-repo~1`). Publishing uses npm Trusted Publishing (OIDC);
  there is no token to commit or rotate. Per-developer MCP config (which may
  hold credentials) is gitignored.
- **Latency is a feature.** speclaw runs inside agent loops and hooks; a change
  that adds wall-clock or tokens to a hot path (hooks, `compass_*`, Cortex)
  must justify it, and performance changes carry a main-vs-branch benchmark
  (`scripts/bench/`).

