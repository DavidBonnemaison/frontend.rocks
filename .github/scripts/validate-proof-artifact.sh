#!/usr/bin/env bash
set -euo pipefail

DIR="$1"
REGISTRY="${NIGHTLY_EXTRA_REGISTRY:-.github/scripts/nightly-extra.json}"
EXPECTED="cache demotions.json diff.json extra history-line.jsonl issues.json latest.json pr-body.md promotions.json summary.md"
ACTUAL=$(cd "$DIR" && ls -1 | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
[ "$ACTUAL" = "$EXPECTED" ] || { echo "Unexpected files: $ACTUAL"; exit 1; }
[ -f "$DIR/cache/.keep" ] && [ -f "$DIR/extra/.keep" ] || { echo "Missing .keep"; exit 1; }

for f in latest.json demotions.json promotions.json diff.json issues.json; do
  jq -e . "$DIR/$f" > /dev/null
  SIZE=$(wc -c < "$DIR/$f" | tr -d ' ')
  [ "$SIZE" -lt 20000000 ] || { echo "$f too large"; exit 1; }
done

jq -e '.schemaVersion == 1 and (.claims | type == "object") and (.experiments | type == "object") and (.demotedPages | type == "object")' "$DIR/latest.json" > /dev/null

for f in demotions.json promotions.json; do
  jq -e 'type == "array" and all(.[];
    (.pageId | type == "string" and test("^[a-z0-9]+(-[a-z0-9]+)*$")) and (.claimIds | type == "array") and
    ((.kind != "vs" and (.file | test("^content/(concepts|autopsies|symptoms|deep-dives|myths)/[a-z0-9-]+\\.mdx$"))) or
     (.kind == "vs" and .file == "content/vs/pairs.json" and (.pageId | startswith("vs-")))))' "$DIR/$f" > /dev/null
done

# A page cannot be both demoted and promoted in the same run.
jq -e -n --slurpfile d "$DIR/demotions.json" --slurpfile p "$DIR/promotions.json" \
  '([$d[0][].pageId] - ([$d[0][].pageId] - [$p[0][].pageId])) | length == 0' > /dev/null

while IFS= read -r line; do
  [ -z "$line" ] && continue
  echo "$line" | jq -e '.kind == "run" or .kind == "claim"' > /dev/null
done < "$DIR/history-line.jsonl"

# Cache directory may only contain JSON files under specs/ or sources/, no symlinks.
if find "$DIR/cache" -type l | grep -q .; then echo "Symlink in cache"; exit 1; fi
find "$DIR/cache" -type f | while IFS= read -r f; do
  case "$f" in
    "$DIR/cache/.keep") ;;
    "$DIR/cache/specs/"*.json|"$DIR/cache/sources/"*.json) jq -e . "$f" > /dev/null ;;
    *) echo "Unexpected cache file: $f"; exit 1 ;;
  esac
done

# Extra directory: every file must match an entry in the registry, and dest must stay under content/.proof-results/.
jq -e '.entries | all(.[]; (.dest | startswith("content/.proof-results/")) and ((.path != null) != (.prefix != null)))' "$REGISTRY" > /dev/null
if find "$DIR/extra" -type l | grep -q .; then echo "Symlink in extra"; exit 1; fi
find "$DIR/extra" -type f ! -name .keep | while IFS= read -r f; do
  REL="${f#"$DIR/extra/"}"
  case "$REL" in *..*) echo "Bad path: $REL"; exit 1 ;; esac
  MATCH=$(jq -r --arg rel "$REL" '[.entries[] | select(.path == $rel or (.prefix != null and (.prefix as $p | ($rel | startswith($p)) and ($rel | test("\\.jsonl?$")))))] | length' "$REGISTRY")
  [ "$MATCH" -ge 1 ] || { echo "Unregistered extra file: $REL"; exit 1; }
  SIZE=$(wc -c < "$f" | tr -d ' ')
  [ "$SIZE" -lt 5000000 ] || { echo "$REL too large"; exit 1; }
  case "$REL" in
    *.jsonl)
      while IFS= read -r line; do
        [ -z "$line" ] || echo "$line" | jq -e . > /dev/null
      done < "$f"
      ;;
    *)
      jq -e . "$f" > /dev/null
      ;;
  esac
done

echo "Artifact OK"
