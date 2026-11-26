import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { nextPieceColor, PIECE_COLORS, pieceAttrs, PieceColorSchema } from '@/lib/design/piece-colors';
import { CONTENT_DIR } from '@/lib/paths';
import { ConceptFrontmatterFileSchema } from '@/lib/schemas';

describe('piece-colors', () => {
  it('returns saffron for empty history', () => {
    expect(nextPieceColor([])).toBe('saffron');
  });

  it('picks the first color absent from the last 4 published pieces', () => {
    expect(nextPieceColor(['saffron', 'tangerine', 'vermilion', 'rose'])).toBe('magenta');
  });

  it('is deterministic and cycles cleanly without repeating within a 4-piece window', () => {
    const history: Array<(typeof PIECE_COLORS)[number]> = [];
    for (let i = 0; i < 14; i++) {
      const next = nextPieceColor(history);
      const recent = history.slice(-4);
      expect(recent).not.toContain(next);
      history.push(next);
    }
    expect(history).toEqual(Array.from({ length: 14 }, (_, idx) => PIECE_COLORS[idx % 5]));
  });

  it('returns data-piece attribute from pieceAttrs', () => {
    expect(pieceAttrs('vermilion')).toEqual({ 'data-piece': 'vermilion' });
  });

  it('assigns valid piece_color to all 14 autopsies with no consecutive duplicates', () => {
    const dir = path.join(CONTENT_DIR, 'autopsies');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(14);

    const parsed = files
      .map((file) => {
        const data = matter(fs.readFileSync(path.join(dir, file), 'utf-8')).data;
        return {
          file,
          caseNumber: Number(data.case_number),
          pieceColor: PieceColorSchema.parse(data.piece_color),
        };
      })
      .sort((a, b) => a.caseNumber - b.caseNumber);

    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i].pieceColor).not.toBe(parsed[i - 1].pieceColor);
    }
  });

  it('rejects piece_color on concept frontmatter', () => {
    const result = ConceptFrontmatterFileSchema.safeParse({
      id: 'sample-concept',
      title: 'Sample Concept',
      domain: 'css-layout',
      piece_color: 'saffron',
      summary_tldr: 'A sample concept summary that meets length requirements.',
      relations: [],
      sources: ['https://drafts.csswg.org/css-contain-3/'],
      last_verified_at: '2026-11-25',
    });
    expect(result.success).toBe(false);
  });
});
