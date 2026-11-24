import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { buildLlmsTxt, SITE_URL } from '@/lib/seo-exports';
import { extractVsPairs } from '@/lib/vs-pairs';

describe('US-17.4: /vs Hub (Compare Primitives)', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const pairs = extractVsPairs(concepts, autopsies);

  it('extracts non-empty /vs/ pairs with both replaces and contrasts_with relations', () => {
    expect(pairs.length).toBeGreaterThan(0);

    const replacesPairs = pairs.filter((p) => p.relationType === 'replaces');
    const contrastsPairs = pairs.filter((p) => p.relationType === 'contrasts_with');

    expect(replacesPairs.length).toBeGreaterThan(0);
    expect(contrastsPairs.length).toBeGreaterThan(0);
  });

  it('provides valid slugs, domains, maturity statuses, and mechanical notes for every pair', () => {
    const validSlugPattern = /^[a-z0-9-]+-vs-[a-z0-9-]+$/;
    const domains = new Set<string>();

    for (const pair of pairs) {
      expect(pair.slug).toMatch(validSlugPattern);
      expect(pair.note.trim().length).toBeGreaterThanOrEqual(20);

      expect(pair.primary.frontmatter.title.trim().length).toBeGreaterThan(0);
      expect(pair.secondary.frontmatter.title.trim().length).toBeGreaterThan(0);

      expect(pair.primary.frontmatter.domain.trim().length).toBeGreaterThan(0);
      expect(pair.secondary.frontmatter.domain.trim().length).toBeGreaterThan(0);

      expect(pair.primary.frontmatter.maturity_status.trim().length).toBeGreaterThan(0);
      expect(pair.secondary.frontmatter.maturity_status.trim().length).toBeGreaterThan(0);

      domains.add(pair.primary.frontmatter.domain);
      domains.add(pair.secondary.frontmatter.domain);
    }

    expect(domains.size).toBeGreaterThan(1);
  });

  it('includes the /vs/ hub URL in llms.txt output', () => {
    const llms = buildLlmsTxt({
      concepts,
      autopsies,
      vsPairs: pairs,
    });

    expect(llms).toContain('## Comparative Trade-Offs (/vs/)');
    expect(llms).toContain(`${SITE_URL}/vs/`);
  });

  it('includes /vs/ in scripts/generate-exports.ts sitemap entries', () => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-exports.ts');
    const source = fs.readFileSync(scriptPath, 'utf-8');

    expect(source).toContain('`${SITE_URL}/vs/`');
  });
});
