import { describe, expect, it } from 'vitest';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import {
  buildAutopsyJsonLd,
  buildConceptJsonLd,
  buildSymptomJsonLd,
  buildVsJsonLd,
  formatAutopsyTitle,
  formatConceptTitle,
  formatVsTitle,
  SITE_URL,
} from '@/lib/seo-schema';
import {
  buildAutopsyMarkdownTwin,
  buildConceptMarkdownTwin,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  buildVsMarkdownTwin,
  getGitLastModified,
} from '@/lib/seo-exports';
import {
  renderAutopsyCoverPng,
  renderAutopsyOgPng,
  renderConceptOgPng,
  renderVsOgPng,
} from '@/lib/og-generator';
import { extractVsPairs } from '@/lib/vs-pairs';
import { PRODUCTION_SYMPTOMS } from '@/config/symptoms';
import { validateProgrammaticSeo } from '@/lib/validators/seo-validator';
import markdownNegotiation from '../netlify/edge-functions/markdown-negotiation';
import {
  collectIndexNowUrls,
  mapChangedFileToUrls,
  submitIndexNow,
} from '../scripts/post-deploy-seo';

describe('US-14.3: SEO Titles, JSON-LD @graph & Git-Freshness Sitemap', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();

  it('formats concept, autopsy, and vs titles cleanly within <= 60 characters', () => {
    for (const c of concepts) {
      const t = formatConceptTitle(c.frontmatter.title);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(t.endsWith('| frontend.rocks')).toBe(true);
    }

    for (const a of autopsies) {
      const t = formatAutopsyTitle(a.frontmatter.symptom, a.frontmatter.case_number);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(t).toContain(`Autopsy #${String(a.frontmatter.case_number).padStart(2, '0')}`);
      expect(t.endsWith('| frontend.rocks')).toBe(true);
    }

    const vsTitle = formatVsTitle('CSS Anchor Positioning', 'Floating UI');
    expect(vsTitle.length).toBeLessThanOrEqual(60);
    expect(vsTitle.endsWith('| frontend.rocks')).toBe(true);
  });

  it('builds deterministic JSON-LD @graph with TechArticle, FAQPage, and BreadcrumbList for concepts', () => {
    const sample = concepts[0];
    expect(sample).toBeDefined();
    const graph = buildConceptJsonLd(sample);

    expect(graph['@context']).toBe('https://schema.org');
    expect(Array.isArray(graph['@graph'])).toBe(true);

    const article = graph['@graph'].find((n) => n['@type'] === 'TechArticle');
    expect(article).toBeDefined();
    expect(article?.headline).toBe(sample.frontmatter.title);
    expect(article?.proficiencyLevel).toBe('Expert');
    expect(article?.dateModified).toBe(sample.frontmatter.last_verified_at);
    expect(article?.citation).toEqual(sample.frontmatter.sources);

    const faq = graph['@graph'].find((n) => n['@type'] === 'FAQPage');
    expect(faq).toBeDefined();
    const questions = faq?.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    expect(questions.length).toBeGreaterThanOrEqual(1);
    expect(questions[0].name).toContain(sample.frontmatter.title);
    expect(questions[0].acceptedAnswer.text).toBe(sample.frontmatter.summary_tldr);

    const breadcrumb = graph['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
    expect(breadcrumb).toBeDefined();
    const items = breadcrumb?.itemListElement as Array<{ position: number; name: string; item: string }>;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: `${SITE_URL}/`,
    });
    expect(items[2].item).toBe(`${SITE_URL}/concepts/${sample.frontmatter.id}/`);
  });

  it('builds deterministic JSON-LD @graph for autopsies, /vs/, and /symptoms/', () => {
    const autopsy = autopsies[0];
    expect(autopsy).toBeDefined();
    const autopsyGraph = buildAutopsyJsonLd(autopsy);

    const article = autopsyGraph['@graph'].find((n) => n['@type'] === 'TechArticle');
    expect(article?.headline).toBe(autopsy.frontmatter.title);
    expect(article?.citation).toEqual(autopsy.frontmatter.sources);

    const breadcrumb = autopsyGraph['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
    const items = breadcrumb?.itemListElement as Array<{ name: string }>;
    expect(items[1].name).toBe('Architecture Autopsies');

    const vsGraph = buildVsJsonLd({
      slug: 'css-anchor-positioning-vs-floating-ui',
      titleA: 'CSS Anchor Positioning',
      titleB: 'Floating UI',
      summary: 'Native CSS anchor positioning vs JS positioning libraries.',
      sources: ['https://developer.mozilla.org/'],
      dateModified: '2026-11-01',
    });
    expect(vsGraph['@graph'].some((n) => n['@type'] === 'TechArticle')).toBe(true);
    expect(vsGraph['@graph'].some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);

    const symptomGraph = buildSymptomJsonLd({
      slug: 'z-index-ignored',
      title: 'My z-index: 9999 is ignored',
      summary: 'Stacking context isolation traps z-index values.',
    });
    expect(symptomGraph['@graph'].some((n) => n['@type'] === 'TechArticle')).toBe(true);
    expect(symptomGraph['@graph'].some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
  });

  it('computes git-freshness lastmod with fallback and builds valid sitemap.xml', () => {
    const sample = concepts[0];
    const gitDate = getGitLastModified(sample.filePath, sample.frontmatter.last_verified_at);
    expect(gitDate).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const fallback = getGitLastModified('/nonexistent/file.mdx', '2026-01-15');
    expect(fallback).toBe('2026-01-15');

    const xml = buildSitemapXml([
      { loc: `${SITE_URL}/concepts/${sample.frontmatter.id}/`, lastmod: gitDate },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(`<loc>${SITE_URL}/concepts/${sample.frontmatter.id}/</loc>`);
    expect(xml).toContain(`<lastmod>${gitDate}</lastmod>`);
  });
});

describe('US-14.4: GEO Markdown Twins, llms.txt, robots.txt & Content Negotiation', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const conceptTitles = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));

  it('generates clean markdown twins without HTML/nav/script noise', () => {
    const c = concepts[0];
    const md = buildConceptMarkdownTwin(c, conceptTitles);
    expect(md).toContain(`# ${c.frontmatter.title}`);
    expect(md).toContain(`**Canonical URL:** ${SITE_URL}/concepts/${c.frontmatter.id}/`);
    expect(md).toContain('## Primary Sources');
    expect(md).not.toMatch(/<(nav|script|style|html|head|body)\b/i);

    const a = autopsies[0];
    const autopsyMd = buildAutopsyMarkdownTwin(a, conceptTitles);
    expect(autopsyMd).toContain(`# ${a.frontmatter.title}`);
    expect(autopsyMd).toContain('## Causal Chain');
    expect(autopsyMd).not.toMatch(/<(nav|script|style|html|head|body)\b/i);
  });

  it('enriches llms.txt with .md URLs, section anchors, and symptom triggers', () => {
    const llms = buildLlmsTxt({
      concepts,
      autopsies,
      productionSymptoms: PRODUCTION_SYMPTOMS,
    });
    expect(llms).toContain('## Symptom Triggers');
    expect(llms).toContain(`${SITE_URL}/symptoms/${PRODUCTION_SYMPTOMS[0].slug}/`);
    expect(llms).toContain(`${SITE_URL}/concepts/${concepts[0].frontmatter.id}.md`);
    expect(llms).toContain('#under-the-hood');
    expect(llms).toContain('#production-pitfalls');
    expect(llms).toContain('#architectural-fix');
  });

  it('emits no section title when concepts, autopsies and symptoms are empty', () => {
    const llms = buildLlmsTxt({ concepts: [], autopsies: [], vsPairs: [], productionSymptoms: [] });
    expect(llms).not.toContain('## Concepts');
    expect(llms).not.toContain('## Architecture Autopsies');
    expect(llms).not.toContain('## Symptom Triggers');
    expect(llms).not.toContain('## Comparative Trade-Offs');
    expect(llms).toContain('## Machine-Readable Exports');
  });

  it('generates robots.txt explicitly allowing AI search bots and referencing sitemap & llms.txt', () => {
    const robots = buildRobotsTxt();
    expect(robots).toContain('User-agent: OAI-SearchBot');
    expect(robots).toContain('User-agent: PerplexityBot');
    expect(robots).toContain('User-agent: ClaudeBot');
    expect(robots).toContain('User-agent: Google-Extended');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(robots).toContain(`LLMs-Txt: ${SITE_URL}/llms.txt`);
  });

  it('negotiates text/markdown in Netlify edge function', async () => {
    let rewrittenTo: string | null = null;
    const mockContext = {
      next: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      rewrite: async (url: string) => {
        rewrittenTo = url;
        return new Response('# Markdown Twin');
      },
    };

    const mdReq = new Request('https://frontend.rocks/concepts/css-stacking-context', {
      headers: { Accept: 'text/markdown, text/html;q=0.8' },
    });
    const mdRes = await markdownNegotiation(mdReq, mockContext);
    expect(rewrittenTo).toBe('/concepts/css-stacking-context.md');
    expect(mdRes.headers.get('Content-Type')).toContain('text/markdown');
    expect(mdRes.headers.get('Vary')).toBe('Accept');

    rewrittenTo = null;
    const htmlReq = new Request('https://frontend.rocks/concepts/css-stacking-context', {
      headers: { Accept: 'text/html' },
    });
    const htmlRes = await markdownNegotiation(htmlReq, mockContext);
    expect(rewrittenTo).toBeNull();
    expect(htmlRes.headers.get('Content-Type')).toContain('text/html');
  });
});

describe('US-14.5: Static Open Graph Image Generation (1200x630 PNG)', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();

  it('renders valid 1200x630 PNG buffers offline for concepts and autopsies', async () => {
    const conceptPng = await renderConceptOgPng(concepts[0]);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(conceptPng.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    // IHDR width (bytes 16..20) and height (bytes 20..24)
    expect(conceptPng.readUInt32BE(16)).toBe(1200);
    expect(conceptPng.readUInt32BE(20)).toBe(630);

    const conceptTitles = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));
    const autopsyPng = await renderAutopsyOgPng(autopsies[0], conceptTitles);
    expect(autopsyPng.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(autopsyPng.readUInt32BE(16)).toBe(1200);
    expect(autopsyPng.readUInt32BE(20)).toBe(630);

    const autopsyCoverPng = await renderAutopsyCoverPng(autopsies[0], conceptTitles);
    expect(autopsyCoverPng.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(autopsyCoverPng.readUInt32BE(16)).toBe(1000);
    expect(autopsyCoverPng.readUInt32BE(20)).toBe(420);
  });
});

describe('US-14.1, US-14.2 & Section 1.2: Programmatic /vs/, /symptoms/ & Anti-Doorway CI Gate', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const conceptTitles = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));

  it('extracts deduplicated /vs/ pairs with zero symmetric duplicates or empty permutations', () => {
    const pairs = extractVsPairs(concepts, autopsies);
    expect(pairs.length).toBeGreaterThanOrEqual(35);

    const slugs = new Set<string>();
    const unorderedPairs = new Set<string>();

    for (const pair of pairs) {
      expect(slugs.has(pair.slug)).toBe(false);
      slugs.add(pair.slug);

      const unordered = [pair.primary.frontmatter.id, pair.secondary.frontmatter.id]
        .sort()
        .join('::');
      expect(unorderedPairs.has(unordered)).toBe(false);
      unorderedPairs.add(unordered);

      expect(pair.note.trim().length).toBeGreaterThanOrEqual(20);
      expect(pair.primary.frontmatter.summary_tldr.length).toBeGreaterThan(0);
      expect(pair.secondary.frontmatter.summary_tldr.length).toBeGreaterThan(0);

      if (pair.relationType === 'replaces') {
        expect(pair.slug).toBe(
          `${pair.primary.frontmatter.id}-vs-${pair.secondary.frontmatter.id}`
        );
      }
    }
  });

  it('passes anti-doorway n-gram uniqueness (< 65%) and /symptoms/ orphan checks', () => {
    const result = validateProgrammaticSeo({
      concepts,
      autopsies,
      productionSymptoms: PRODUCTION_SYMPTOMS,
    });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.stats.maxVsOverlap).toBeLessThan(0.65);
    expect(result.stats.maxSymptomOverlap).toBeLessThan(0.65);
    expect(result.stats.symptomCount).toBeGreaterThanOrEqual(20);
    expect(result.stats.symptomCount).toBeLessThanOrEqual(30);
  });

  it('rejects orphan concept_ids or autopsy_ids in symptoms config', () => {
    const badSymptoms = [
      ...PRODUCTION_SYMPTOMS,
      {
        slug: 'orphan-test-symptom',
        proof_status: 'unverified' as const,
        search_title: 'Orphan test symptom',
        devtools_signature: 'TypeError: orphan',
        autopsy_ids: ['nonexistent-autopsy'],
        concept_ids: ['nonexistent-concept'],
        summary: 'Synthetic orphan symptom for validator testing.',
      },
    ];

    const result = validateProgrammaticSeo({
      concepts,
      autopsies,
      productionSymptoms: badSymptoms,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('orphan concept_id "nonexistent-concept"'))).toBe(
      true
    );
    expect(result.errors.some((e) => e.includes('orphan autopsy_id "nonexistent-autopsy"'))).toBe(
      true
    );
  });

  it('generates /vs/[pair].md twin and 1200x630 /og/vs/[pair].png', async () => {
    const pairs = extractVsPairs(concepts, autopsies);
    const sample = pairs[0];
    expect(sample).toBeDefined();

    const md = buildVsMarkdownTwin(sample, conceptTitles);
    expect(md).toContain(
      `# ${sample.primary.frontmatter.title} vs ${sample.secondary.frontmatter.title}`
    );
    expect(md).toContain(`**Canonical URL:** ${SITE_URL}/vs/${sample.slug}/`);
    expect(md).toContain('## Comparison Matrix');
    expect(md).toContain(sample.note);
    expect(md).not.toMatch(/<(nav|script|style|html|head|body)\b/i);

    const png = await renderVsOgPng(sample);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);

    const vsJsonLd = buildVsJsonLd({
      slug: sample.slug,
      titleA: sample.primary.frontmatter.title,
      titleB: sample.secondary.frontmatter.title,
      summary: sample.note,
      sources: sample.sources,
      dateModified: sample.dateModified,
    });
    expect(vsJsonLd['@graph'].some((n) => n['@type'] === 'FAQPage')).toBe(true);
  });
});

describe('US-14.6: Post-Deploy SEO Pipeline (IndexNow)', () => {
  it('maps changed git diff files to canonical frontend.rocks URLs', () => {
    expect(mapChangedFileToUrls('content/concepts/css-stacking-context.mdx')).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
    ]);
    expect(mapChangedFileToUrls('content/autopsies/zindex-9999-tooltip-war.mdx')).toEqual([
      'https://frontend.rocks/autopsies/zindex-9999-tooltip-war/',
    ]);
    expect(mapChangedFileToUrls('content/digests/2026-w46.json')).toEqual([
      'https://frontend.rocks/digest/',
    ]);
    expect(mapChangedFileToUrls('content/labs/css-stacking-context.json')).toEqual([
      'https://frontend.rocks/embed/lab/css-stacking-context/',
    ]);
    expect(mapChangedFileToUrls('src/config/symptoms.ts')).toEqual([
      'https://frontend.rocks/symptoms/',
    ]);
    expect(mapChangedFileToUrls('README.md')).toEqual([]);

    expect(
      collectIndexNowUrls([
        'content/concepts/css-stacking-context.mdx',
        'content/concepts/css-stacking-context.mdx',
        'src/config/symptoms.ts',
        'package.json',
      ])
    ).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
      'https://frontend.rocks/symptoms/',
    ]);
  });

  it('skips gracefully without error when the IndexNow key is missing', async () => {
    const indexRes = await submitIndexNow(['https://frontend.rocks/concepts/css-stacking-context/'], {});
    expect(indexRes).toEqual({ skipped: true, reason: 'INDEXNOW_KEY not set' });
  });

  it('submits the URL list to IndexNow when the key is set', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const res = await submitIndexNow(
      ['https://frontend.rocks/concepts/css-stacking-context/'],
      { INDEXNOW_KEY: 'k' },
      mockFetch
    );
    expect(res).toEqual({ skipped: false, submittedCount: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.indexnow.org/indexnow');
    expect(JSON.parse(calls[0].body).urlList).toEqual([
      'https://frontend.rocks/concepts/css-stacking-context/',
    ]);
  });
});
