export const MAX_EXCERPT_LINES = 40;
export const MAX_EXCERPT_CHARS = 2500;

export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * Strips common leading indentation (spaces and tabs, each tab counting as 1 char)
 * and trailing spaces/tabs. Blank lines are excluded from the common indentation calculation.
 */
export function dedentLines(lines: string[]): string[] {
  const trimmedEnd = lines.map((l) => l.replace(/[ \t]+$/, ''));
  const indents = trimmedEnd
    .filter((l) => l.length > 0)
    .map((l) => /^[ \t]*/.exec(l)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return trimmedEnd.map((l) => (l.length === 0 ? '' : l.slice(common)));
}

/** Normalized form of a source excerpt. Throws if the excerpt has no non-empty lines. */
export function normalizeExcerpt(text: string): string {
  const lines = dedentLines(splitLines(text));
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) throw new Error('Empty excerpt');
  return lines.join('\n');
}

/** Returns the normalized excerpt at 1-indexed inclusive lines [start, end], or null if out of bounds or blank. */
export function excerptAt(fileText: string, start: number, end: number): string | null {
  const lines = splitLines(fileText);
  if (start < 1 || end > lines.length || start > end) return null;
  try {
    return normalizeExcerpt(lines.slice(start - 1, end).join('\n'));
  } catch {
    return null;
  }
}

/**
 * Returns all 1-indexed inclusive [start, end] ranges where the excerpt appears.
 * Compares line by line after dedenting each window and stripping trailing whitespace.
 */
export function findExcerpt(fileText: string, excerpt: string): Array<[number, number]> {
  const needle = normalizeExcerpt(excerpt).split('\n');
  const lines = splitLines(fileText);
  const matches: Array<[number, number]> = [];
  for (let i = 0; i + needle.length <= lines.length; i++) {
    const window = dedentLines(lines.slice(i, i + needle.length));
    if (window.every((l, k) => l === needle[k])) {
      matches.push([i + 1, i + needle.length]);
    }
  }
  return matches;
}

export function checkExcerptSize(
  excerpt: string
): { ok: true } | { ok: false; reason: 'excerpt-too-long'; message: string } {
  const lines = excerpt.split('\n').length;
  if (lines > MAX_EXCERPT_LINES || excerpt.length > MAX_EXCERPT_CHARS) {
    return {
      ok: false,
      reason: 'excerpt-too-long',
      message: `${lines} lines / ${excerpt.length} chars (max ${MAX_EXCERPT_LINES} / ${MAX_EXCERPT_CHARS}).`,
    };
  }
  return { ok: true };
}
