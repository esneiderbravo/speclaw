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
  English, lowercase. Types in use: `feat`, `fix`, `docs`, `chore`, `ci`;
  scopes name the area (`init`, `compass`, `visualize`, `readme`). Examples:
  `feat(init): warn up-front when a newer speclaw is available`,
  `fix(compass): rebuild the index db when its schema is stale`.
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
- Ask before irreversible or outward-facing actions (destructive commands,
  publishing reviews/tickets/comments).

## speclaw-specific base rules

- **Working language is English** — every commit, PR, docstring, comment, and
  doc in this repo is English. Match it.
- **Local-first, no new runtime surface.** No dependency that requires a network
  call, cloud service, LLM, API key, or native build at runtime (see the
  project-specific laws in [`../../LAWS.md`](../../LAWS.md)). Parsers are WASM;
  storage is `node:sqlite`.
- **Node ≥22, ESM only.** Relative imports carry explicit `.js` extensions;
  the package is `"type": "module"` with `Node16` resolution.
- **Assets flow through the build.** Anything under `src/**/assets/` must be
  copied by `scripts/copy-assets.mjs` — never hand-place files in `dist/`.
- **No secrets in the repo.** Publishing uses npm Trusted Publishing (OIDC);
  there is no token to commit or rotate.

