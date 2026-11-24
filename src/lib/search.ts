export type SearchItemKind =
  | 'concept'
  | 'autopsy'
  | 'lab'
  | 'symptom'
  | 'vs'
  | 'digest'
  | 'agent';

export interface SearchItem {
  kind: SearchItemKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords?: string;
  searchText: string;
  badge: string;
}

export const SEARCH_WEIGHTS = {
  title: 10,
  keywords: 6,
  subtitle: 3,
  searchText: 1,
} as const;

export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Deterministic multi-token weighted scoring.
 * All tokens must match at least one searchable field (AND semantics).
 * Per-token weight precedence:
 *   title (10) > keywords / devtools_signature (6) > subtitle (3) > searchText (1).
 */
export function scoreSearchItem(item: SearchItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const title = item.title.toLowerCase();
  const keywords = (item.keywords ?? '').toLowerCase();
  const subtitle = item.subtitle.toLowerCase();
  const searchText = item.searchText.toLowerCase();

  let totalScore = 0;

  for (const token of tokens) {
    if (title.includes(token)) {
      totalScore += SEARCH_WEIGHTS.title;
    } else if (keywords.includes(token)) {
      totalScore += SEARCH_WEIGHTS.keywords;
    } else if (subtitle.includes(token)) {
      totalScore += SEARCH_WEIGHTS.subtitle;
    } else if (searchText.includes(token)) {
      totalScore += SEARCH_WEIGHTS.searchText;
    } else {
      return 0;
    }
  }

  return totalScore;
}

export function searchItems(
  items: SearchItem[],
  query: string,
  limit = 12
): SearchItem[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return items.slice(0, Math.min(limit, 10));
  }

  const scored: Array<{ item: SearchItem; score: number }> = [];
  for (const item of items) {
    const score = scoreSearchItem(item, tokens);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const titleCmp = a.item.title.localeCompare(b.item.title);
    if (titleCmp !== 0) return titleCmp;
    return a.item.id.localeCompare(b.item.id);
  });

  return scored.slice(0, limit).map((entry) => entry.item);
}
