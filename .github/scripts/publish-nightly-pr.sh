#!/usr/bin/env bash
set -euo pipefail

DIR="$1"
DRY_RUN="${DRY_RUN:-0}"
REGISTRY="${NIGHTLY_EXTRA_REGISTRY:-.github/scripts/nightly-extra.json}"
DATE="${NIGHTLY_DATE:-$(date -u +%Y-%m-%d)}"
MONTH="${DATE:0:7}"
BRANCH="proof/nightly-${DATE}"

git config user.name "frontend-rocks-proof-bot"
git config user.email "proof-bot@users.noreply.frontend.rocks"

# 1. Close any still-open previous nightly PR and delete its branch.
if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY_RUN] gh pr list --state open --label proof-nightly --json number,headRefName"
  if [ -n "${DRY_RUN_OPEN_PRS:-}" ]; then
    echo "$DRY_RUN_OPEN_PRS" | jq -r '.[] | "\(.number) \(.headRefName)"' | while read -r NUM REF; do
      [ -z "$NUM" ] && continue
      echo "[DRY_RUN] gh pr close $NUM --comment \"Superseded by the ${DATE} run.\" --delete-branch"
    done
  fi
else
  gh pr list --state open --label proof-nightly --json number,headRefName --jq '.[] | "\(.number) \(.headRefName)"' |
  while read -r NUM REF; do
    [ -z "$NUM" ] && continue
    gh pr close "$NUM" --comment "Superseded by the ${DATE} run." --delete-branch
  done
fi

# 2. Apply validated files onto a dedicated branch.
git checkout -b "$BRANCH"
mkdir -p content/.proof-results/history
cp "$DIR/latest.json" content/.proof-results/latest.json

# Demotions and promotions: update only proof_status in listed files.
apply_status() {
  local LIST_FILE="$1"
  local FROM_STATUS="$2"
  local TO_STATUS="$3"
  jq -r '.[] | "\(.kind) \(.pageId) \(.file)"' "$LIST_FILE" | while read -r KIND PAGE FILE; do
    [ -z "$PAGE" ] && continue
    [ -f "$FILE" ] || { echo "Missing $FILE for $PAGE"; exit 1; }
    if [ "$KIND" = "vs" ]; then
      local SLUG="${PAGE#vs-}"
      jq --indent 2 --arg slug "$SLUG" --arg from "$FROM_STATUS" --arg to "$TO_STATUS" \
        '(.pairs[] | select(.slug == $slug and .proof_status == $from) | .proof_status) = $to' "$FILE" > "$FILE.tmp"
      mv "$FILE.tmp" "$FILE"
    else
      sed "s/^proof_status: ${FROM_STATUS}\$/proof_status: ${TO_STATUS}/" "$FILE" > "$FILE.tmp"
      mv "$FILE.tmp" "$FILE"
    fi
    git add "$FILE"
  done
}

apply_status "$DIR/demotions.json" proven unverified
apply_status "$DIR/promotions.json" unverified proven

cat "$DIR/history-line.jsonl" >> "content/.proof-results/history/${MONTH}.jsonl"

if [ -d "$DIR/cache/specs" ]; then
  mkdir -p content/.proof-cache/specs
  cp "$DIR"/cache/specs/*.json content/.proof-cache/specs/ 2>/dev/null || true
fi
if [ -d "$DIR/cache/sources" ]; then
  mkdir -p content/.proof-cache/sources
  cp "$DIR"/cache/sources/*.json content/.proof-cache/sources/ 2>/dev/null || true
fi

# Copy registered extra files to their declared destinations under content/.proof-results/.
find "$DIR/extra" -type f ! -name .keep | while IFS= read -r f; do
  REL="${f#"$DIR/extra/"}"
  DEST=$(jq -r --arg rel "$REL" 'first(.entries[] | if .path == $rel then .dest elif (.prefix != null and (.prefix as $p | $rel | startswith($p))) then .prefix as $p | .dest + ($rel | ltrimstr($p)) else empty end)' "$REGISTRY")
  [ -n "$DEST" ] || { echo "No destination for extra file $REL"; exit 1; }
  mkdir -p "$(dirname "$DEST")"
  cp "$f" "$DEST"
done

git add content/.proof-results
if [ -d content/.proof-cache ]; then
  git add content/.proof-cache
fi

if git diff --cached --quiet; then
  echo "No changes"
  exit 0
fi

# Guardrail: refuse any path or diff outside the allowed set.
ALLOWED_FILES=$(jq -r -s '[.[][].file] | unique | .[]' "$DIR/demotions.json" "$DIR/promotions.json")
for F in $(git diff --cached --name-only); do
  if echo "$F" | grep -qE '^content/\.proof-(results|cache/specs|cache/sources)/'; then
    continue
  fi
  if echo "$ALLOWED_FILES" | grep -qxF "$F"; then
    if [ "$F" = "content/vs/pairs.json" ]; then
      SAME=$([ "$(git show HEAD:"$F" | jq -S 'del(.pairs[].proof_status)')" = "$(jq -S 'del(.pairs[].proof_status)' "$F")" ] && echo yes || echo no)
      CHANGED_SLUGS=$(jq -r -n --slurpfile a <(git show HEAD:"$F") --slurpfile b "$F" \
        '[$a[0].pairs[] as $x | $b[0].pairs[] | select(.slug == $x.slug and .proof_status != $x.proof_status) | .slug] | .[]')
      LISTED_SLUGS=$(jq -r -s '[.[][] | select(.kind == "vs") | .pageId | ltrimstr("vs-")] | .[]' "$DIR/demotions.json" "$DIR/promotions.json")
      EXTRA=$(comm -23 <(echo "$CHANGED_SLUGS" | sort -u) <(echo "$LISTED_SLUGS" | sort -u) | grep . || true)
      if [ "$SAME" = yes ] && [ -z "$EXTRA" ]; then
        continue
      fi
    else
      CHANGED_LINES=$(git diff --cached -U0 -- "$F" | grep -E '^[+-][^+-]' | grep -vE '^[+-]proof_status: (proven|unverified)$' || true)
      [ -z "$CHANGED_LINES" ] && continue
    fi
  fi
  echo "Refusing to commit $F"
  exit 1
done

git commit -m "chore(proof): nightly results ${DATE}"

if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY_RUN] git push origin $BRANCH"
  echo "[DRY_RUN] gh label create proof-nightly --color 0E8A16"
  echo "[DRY_RUN] gh pr create --base main --head $BRANCH --title \"chore(proof): nightly results ${DATE}\" --body-file $DIR/pr-body.md --label proof-nightly"
  echo "[DRY_RUN] gh pr merge <PR_URL> --auto --squash --delete-branch"
  exit 0
fi

git push origin "$BRANCH"

# 3. Open PR, then enable auto-merge (retry while GitHub computes mergeability).
gh label create proof-nightly --color 0E8A16 2>/dev/null || true
PR_URL=$(gh pr create --base main --head "$BRANCH" --title "chore(proof): nightly results ${DATE}" --body-file "$DIR/pr-body.md" --label proof-nightly)
for i in 1 2 3; do
  if gh pr merge "$PR_URL" --auto --squash --delete-branch; then
    exit 0
  fi
  sleep 10
done
echo "Could not enable auto-merge on $PR_URL"
exit 1
