# Design — update-refreshes-managed-files

## Approach

### File ownership

Two fixed buckets, defined in one place (e.g. `src/modules/foundation/ownership.ts`):

- `MANAGED_TREES = ["ai-specs/skills", "ai-specs/commands", "ai-specs/rules", "ai-specs/agents"]`
- `PERSONALIZED = ["CLAUDE.md", "AGENTS.md", "LAWS.md", "docs/standards", "docs/compass.md", "lawbook/config.yaml"]`

Rationale: managed files are speclaw logic (a user editing them is a fork);
personalized files carry project content the agent wrote at init.

### Overwrite with baseline safety

Extend the manifest (`src/shared/manifest.ts`) with
`baselines: Record<relPath, sha256>` — the hash of the content speclaw last
wrote for each managed file. Add a `copyRendered` mode (or a sibling
`refreshRendered`) that, for a managed destination:

- missing → write it, record baseline;
- exists and `sha(current) === baseline` → overwrite (it's unchanged since we
  wrote it), refresh baseline;
- exists and `sha(current) !== baseline` (or no baseline recorded) → copy to
  `<file>.bak`, overwrite, refresh baseline, and add a line to the report.

`scaffold`/`init` record baselines for managed files so future updates can tell
"unchanged" from "user-edited".

### Update flow (`applyProjectMigrations`)

1. Refresh managed trees with the overwrite-mode copy (per above); report what
   was updated and what was backed up.
2. Build the personalized-file prompt: for each `MIGRATIONS` entry newer than the
   project's manifest version that carries an `agentPrompt` string, collect it;
   print them as one agent-generic handoff ("Using the agent you're using,
   apply these updates to your personalized files, preserving project content:
   …"). This reuses the existing version-gating (`isNewer`) and the `MIGRATIONS`
   array, which gains an optional `agentPrompt` field. Ship the 0.1.x entries
   (Compass-first rule wording; reports mandatory step in config.yaml).
3. Write the manifest at the new version (with refreshed baselines).

### Agent-generic language

In `init.ts`, replace `paste it into ${primary.label}` with agent-generic
wording ("Paste this into the agent you're using:"), optionally keeping the
chosen agent as a parenthetical hint. The new update prompt uses the same
phrasing. The agent **labels** in the selector (`agents.ts`) stay — those name
real products the user picks; only the imperative handoff copy is genericized.

## Alternatives weighed

1. **Overwrite managed files whenever they differ from the NEW template, no
   baselines.** Simpler (no manifest change), but it cannot tell "user edited"
   from "template moved", so it would write a `.bak` for every improved file
   even when the user never touched it — noisy and alarming. Baselines make
   `.bak` mean "you had local edits". Chosen: baselines.

2. **Auto-edit personalized files via marker regions** (`<!-- speclaw:managed
   -->`). Powerful — would let Rule 1 refresh in place — but requires marking up
   every template and a splicing engine. Deferred to a follow-up; the agent
   prompt delivers the same outcome now with far less machinery.

3. **Overwrite everything, back up personalized files too.** Rejected: it churns
   the user's constitution into `.bak` on every release and pushes reconciliation
   onto a diff review instead of the agent. Personalized content is exactly what
   should not be mechanically overwritten.

## Trade-offs

- Managed files become truly speclaw-owned: local edits survive only as `.bak`.
  Accepted — that is the definition of "managed", and nothing is lost.
- The personalized prompt is only as complete as the `agentPrompt` entries we
  write per release. Accepted: it is the same discipline as a changelog, and it
  keeps project content under the agent's judgement rather than a blind merge.
- Baselines slightly grow the manifest. Negligible.

## Affected files

- `src/shared/manifest.ts` — `baselines` in the `Manifest` type + read/write.
- `src/shared/install.ts` — overwrite-with-baseline copy mode + `.bak` backup.
- `src/modules/foundation/ownership.ts` (new) — the managed/personalized lists.
- `src/modules/foundation/scaffold.ts` — record baselines; refresh managed on update path.
- `src/cli/commands/update.ts` — refresh managed trees; build + print the
  personalized agent prompt; `MIGRATIONS` gains `agentPrompt`.
- `src/cli/commands/init.ts` — agent-generic handoff wording.
- Docs: `docs/standards/lawbook.md` (+ template) / `README.md` — how update
  delivers changes now.
