# cortex-review

How the Cortex reviewer is scoped so a review costs about a minute of agent
time instead of five, while still catching the known defect classes. Works the
same in any agent: it is a prompt and a diff file, not a model choice.

### Requirement: The review starts from the diff

WHEN `cortex` action `brief` is called while the change is at stage `reviewing`, the system SHALL export the branch diff (committed since the merge-base with the default branch, uncommitted and untracked files, excluding `.speclaw/`) to `.speclaw/review/<change>.diff` and return a `review` field with `diffPath`, `base`, `files`, `reportPath` and `prompt`.

#### Scenario: Brief at reviewing
- Given a change at stage `reviewing` with committed, uncommitted and untracked edits
- When `cortex` action `brief` is called
- Then `review.diffPath` holds all three edits and no `.speclaw/` file

#### Scenario: Brief at another stage
- Given a change at stage `implementing`
- When `cortex` action `brief` is called
- Then the result has no `review` field

### Requirement: The review prompt is bounded

The review prompt SHALL tell the reviewer to read the diff once, call `compass_diff_context` once, read only changed hunks, write `reports/review.md` in at most 40 lines (verdict, blocking findings with file:line, non-blocking list), and check every known defect class.

#### Scenario: Prompt content
- Given a change at stage `reviewing`
- When the review prompt is built
- Then it names `compass_diff_context`, the 40-line cap and each defect class

### Requirement: The reviewer agent stays agent-agnostic

The shipped reviewer agent SHALL list every defect class of the review prompt, SHALL NOT pin a model, and SHALL NOT name a retired tool.

#### Scenario: Shipped reviewer
- Given the reviewer agent asset
- When it is read
- Then it has no `model:` line and contains every defect class
