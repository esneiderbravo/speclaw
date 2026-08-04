#!/usr/bin/env bash
#
# Apply classic branch protection to a branch (default: main) from the committed
# .github/branch-protection.json, so a change merges only through a pull request
# whose required checks (`build`, `test`) pass on an up-to-date branch, with
# linear history and no force-pushes. See docs/standards/testing-standards.md.
#
# Requires: the GitHub CLI (`gh auth login`) and admin on the repository. The
# agent does not run this — it changes repository settings (Rule 6); a human with
# admin runs it and reviews the result.
#
# ORDERING CAVEAT: GitHub only accepts a status check as *required* after it has
# reported at least once. Merge the CI workflow (or push the branch once) so the
# `build` and `test` checks have run, THEN apply protection.
#
# Usage: scripts/apply-branch-protection.sh [branch]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="$repo_root/.github/branch-protection.json"
branch="${1:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is required. Install it and run 'gh auth login'." >&2
  exit 1
fi

slug="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Applying branch protection to ${slug}@${branch} from ${config}"

gh api -X PUT "repos/${slug}/branches/${branch}/protection" --input "$config"

echo "Done. Verify with: gh api repos/${slug}/branches/${branch}/protection"
