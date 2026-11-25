#!/usr/bin/env bash
# Validates a radar patch against a strict path allowlist, applies it, and opens/updates the weekly PR.
# Uses only bash, git, jq, and gh (never executes repository code).
# Usage: bash .github/scripts/publish-radar-pr.sh <incoming-dir>
# Set DRY_RUN=1 to validate the patch and exit without modifying git state or calling gh.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: bash .github/scripts/publish-radar-pr.sh <incoming-dir>" >&2
  exit 2
fi

INCOMING_DIR="$1"
PATCH="$INCOMING_DIR/radar.patch"
REPORT="$INCOMING_DIR/report.md"
BRANCH="radar/weekly"

if [ ! -s "$PATCH" ]; then
  echo "Error: missing or empty patch at $PATCH" >&2
  exit 1
fi

if [ ! -f "$REPORT" ]; then
  echo "Error: missing report at $REPORT" >&2
  exit 1
fi

is_allowed_path() {
  local p="$1"
  case "$p" in
    package.json|package-lock.json|content/.proof-cache/support-snapshot.json)
      return 0
      ;;
  esac
  if [[ "$p" =~ ^content/claims/[a-z0-9]+(-[a-z0-9]+)*\.claims\.json$ ]]; then
    return 0
  fi
  return 1
}

# Parse every `diff --git a/<p1> b/<p2>` header in the patch and fail closed if any path is disallowed.
matched_headers=0
while IFS= read -r line; do
  if [[ "$line" =~ ^diff\ --git\ a/(.+)\ b/(.+)$ ]]; then
    p1="${BASH_REMATCH[1]}"
    p2="${BASH_REMATCH[2]}"
    matched_headers=$((matched_headers + 1))
    if ! is_allowed_path "$p1"; then
      echo "Refused: patch touches disallowed path \"$p1\"" >&2
      exit 1
    fi
    if ! is_allowed_path "$p2"; then
      echo "Refused: patch touches disallowed path \"$p2\"" >&2
      exit 1
    fi
  fi
done < "$PATCH"

if [ "$matched_headers" -eq 0 ]; then
  echo "Refused: patch contains no valid diff headers" >&2
  exit 1
fi

# Also check +++ / --- headers in case of malformed or crafted patches.
while IFS= read -r line; do
  if [[ "$line" =~ ^(\+\+\+|---)\ [ab]/(.+)$ ]]; then
    p="${BASH_REMATCH[2]}"
    if ! is_allowed_path "$p"; then
      echo "Refused: patch header touches disallowed path \"$p\"" >&2
      exit 1
    fi
  fi
done < "$PATCH"

git apply --check "$PATCH"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1: validated $matched_headers file(s) in $PATCH"
  exit 0
fi

if [ -z "${GH_TOKEN:-}" ]; then
  echo "Error: GH_TOKEN (NIGHTLY_PR_TOKEN) is required; never fall back to GITHUB_TOKEN." >&2
  exit 1
fi

if [ -z "$(git config user.name || true)" ]; then
  git config user.name "David Bonnemaison"
fi
if [ -z "$(git config user.email || true)" ]; then
  git config user.email "10919625+DavidBonnemaison@users.noreply.github.com"
fi

# Close any existing open weekly radar PR so the new branch starts fresh.
open_prs="$(gh pr list --head "$BRANCH" --state open --json number | jq -r '.[].number')"
if [ -n "$open_prs" ]; then
  while IFS= read -r pr_num; do
    [ -z "$pr_num" ] && continue
    gh pr close "$pr_num" --delete-branch
  done <<< "$open_prs"
fi

git checkout -B "$BRANCH"
git apply "$PATCH"

git add -- package.json package-lock.json content/.proof-cache/support-snapshot.json
if [ -d content/claims ]; then
  git add -- content/claims
fi

if git diff --cached --quiet; then
  echo "No staged changes after applying patch."
  exit 0
fi

git commit -m "chore(radar): weekly compatibility data update"
git push --force-with-lease origin "$BRANCH"

PR_URL="$(gh pr create \
  --title "Weekly compatibility data update" \
  --body-file "$REPORT" \
  --label baseline-radar \
  --head "$BRANCH" \
  --base main)"

echo "Opened PR: $PR_URL"

# Enable auto-merge with 3 retries spaced 10s apart.
merged_enabled=false
for attempt in 1 2 3; do
  if gh pr merge "$PR_URL" --auto --squash; then
    merged_enabled=true
    break
  fi
  if [ "$attempt" -lt 3 ]; then
    sleep 10
  fi
done

if [ "$merged_enabled" != "true" ]; then
  echo "Warning: could not enable auto-merge on $PR_URL after 3 attempts." >&2
fi
