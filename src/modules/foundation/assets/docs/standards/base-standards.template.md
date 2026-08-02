# Base Standards — {{project_name}}

Cross-cutting rules that apply to **all** code in this repository, regardless
of layer or language. This is a law of the project — see [`../../LAWS.md`](../../LAWS.md).

## Languages

- **Code, identifiers, comments, docstrings, commit messages, PR titles/bodies,
  and technical docs**: the repo's artifact language (default English).
- **User-facing product copy**: as the product requires.
- **Agent ↔ human communication** (review comments, thread replies, ticket
  bodies): the team's working language ({{team_language}}). Technical terms
  stay in English within that prose — don't force-translate them.

## Commits & branches

- **Branch naming**: `{{branch_pattern}}`
- **Commit style**: {{commit_style}}
- One focused change per branch; the smallest correct diff. No drive-by
  refactors mixed into a feature branch.

## Comments & documentation

- Comments state **constraints the code cannot express** (invariants, tricky
  edge cases, "why"). They never narrate history, restate the next line, or
  address the reviewer.
- **Never** put ticket IDs, ticket text, or changelog narration
  ("added for {{ticket_prefix}}-123", "fixed as part of…") in code or
  docstrings. Traceability lives in the branch name, PR, and git history.

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

<!-- speclaw init: add any project-specific base rules the analysis surfaced. -->
{{base_standards_extra}}
