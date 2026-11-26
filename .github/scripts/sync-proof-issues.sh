#!/usr/bin/env bash
set -euo pipefail

ISSUES_FILE="$1"
DRY_RUN="${DRY_RUN:-0}"
DATE="${NIGHTLY_DATE:-$(date -u +%Y-%m-%d)}"
MAX_NEW_ISSUES=20

jq -e '(.open | type == "array") and (.comment | type == "array") and (.close | type == "array")' "$ISSUES_FILE" > /dev/null

if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY_RUN] gh label create proof-regression --color B60205"
  echo "[DRY_RUN] gh label create automated --color 0E8A16"
  OPEN_ISSUES="${DRY_RUN_OPEN_ISSUES:-[]}"
else
  gh label create proof-regression --color B60205 2>/dev/null || true
  gh label create automated --color 0E8A16 2>/dev/null || true
  OPEN_ISSUES=$(gh issue list --state open --label proof-regression --json number,body --limit 200)
fi

find_issue_number() {
  local KEY="$1"
  echo "$OPEN_ISSUES" | jq -r --arg marker "<!-- key: ${KEY} -->" \
    'first(.[] | select((.body // "") | contains($marker)) | .number) // empty'
}

# 1. Process open actions: deduplicate by key, cap new creations at 20.
NEW_INDICES=()
OPEN_COUNT=$(jq '.open | length' "$ISSUES_FILE")
for ((i = 0; i < OPEN_COUNT; i++)); do
  KEY=$(jq -r ".open[$i].key" "$ISSUES_FILE")
  BODY=$(jq -r ".open[$i].body" "$ISSUES_FILE")
  NUM=$(find_issue_number "$KEY")
  if [ -n "$NUM" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY_RUN] gh issue comment $NUM --body-file - (key=$KEY)"
    else
      gh issue comment "$NUM" --body "$BODY"
    fi
  else
    NEW_INDICES+=("$i")
  fi
done

NEW_COUNT="${#NEW_INDICES[@]}"
if [ "$NEW_COUNT" -gt "$MAX_NEW_ISSUES" ]; then
  SUMMARY_TITLE="[proof] ${NEW_COUNT} regressions in nightly ${DATE}"
  SUMMARY_BODY="<!-- key: proof-regression-batch:${DATE} -->"$'\n\n'"${NEW_COUNT} proof regressions detected in nightly ${DATE}:"$'\n'
  for idx in "${NEW_INDICES[@]}"; do
    T=$(jq -r ".open[$idx].title" "$ISSUES_FILE")
    K=$(jq -r ".open[$idx].key" "$ISSUES_FILE")
    SUMMARY_BODY+="- ${T} (\`${K}\`)"$'\n'
  done
  if [ "$DRY_RUN" = "1" ]; then
    echo "[DRY_RUN] gh issue create --title \"$SUMMARY_TITLE\" --label proof-regression --label automated"
  else
    gh issue create --title "$SUMMARY_TITLE" --body "$SUMMARY_BODY" --label proof-regression --label automated
  fi
elif [ "$NEW_COUNT" -gt 0 ]; then
  for idx in "${NEW_INDICES[@]}"; do
    TITLE=$(jq -r ".open[$idx].title" "$ISSUES_FILE")
    BODY=$(jq -r ".open[$idx].body" "$ISSUES_FILE")
    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY_RUN] gh issue create --title \"$TITLE\" --label proof-regression --label automated"
    else
      gh issue create --title "$TITLE" --body "$BODY" --label proof-regression --label automated
    fi
  done
fi

# 2. Process comment actions (e.g. day 7 notice).
COMMENT_COUNT=$(jq '.comment | length' "$ISSUES_FILE")
for ((i = 0; i < COMMENT_COUNT; i++)); do
  KEY=$(jq -r ".comment[$i].key" "$ISSUES_FILE")
  BODY=$(jq -r ".comment[$i].body" "$ISSUES_FILE")
  NUM=$(find_issue_number "$KEY")
  if [ -n "$NUM" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY_RUN] gh issue comment $NUM --body \"$BODY\""
    else
      gh issue comment "$NUM" --body "$BODY"
    fi
  fi
done

# 3. Process close actions (recoveries).
CLOSE_COUNT=$(jq '.close | length' "$ISSUES_FILE")
for ((i = 0; i < CLOSE_COUNT; i++)); do
  KEY=$(jq -r ".close[$i].key" "$ISSUES_FILE")
  COMMENT=$(jq -r ".close[$i].comment" "$ISSUES_FILE")
  NUM=$(find_issue_number "$KEY")
  if [ -n "$NUM" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY_RUN] gh issue comment $NUM --body \"$COMMENT\""
      echo "[DRY_RUN] gh issue close $NUM"
    else
      gh issue comment "$NUM" --body "$COMMENT"
      gh issue close "$NUM"
    fi
  fi
done
