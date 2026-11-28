import { describe, expect, it } from 'vitest';
import {
  getAllAutopsies,
  getAllConcepts,
  getAllLabs,
} from '../src/lib/content-loader';
import { getAllSymptoms } from '../src/lib/symptoms/loader';
import { extractVsPairs } from '../src/lib/vs-pairs';
import {
  SEARCH_WEIGHTS,
  scoreSearchItem,
  searchItems,
  tokenizeQuery,
  type SearchItem,
} from '../src/lib/search';
import { buildSearchIndex, resolveLabParent } from '../src/lib/search-index';

describe('US-16.1: Multi-token weighted search engine', () => {
  const sampleItems: SearchItem[] = [
    {
      kind: 'concept',
      id: 'in-search-text',
      title: 'Unrelated Alpha',
      subtitle: 'Generic description',
      keywords: 'other',
      href: '/concepts/in-search-text/',
      searchText: 'contains quantum token only in searchtext',
      badge: 'Concept',
    },
    {
      kind: 'concept',
      id: 'in-subtitle',
      title: 'Unrelated Beta',
      subtitle: 'Mentions quantum in subtitle',
      keywords: 'other',
      href: '/concepts/in-subtitle/',
      searchText: 'unrelated beta mentions quantum in subtitle',
      badge: 'Concept',
    },
    {
      kind: 'symptom',
      id: 'in-keywords',
      title: 'Unrelated Gamma',
      subtitle: 'Generic description',
      keywords: 'DevTools signature: quantum leak detected',
      href: '/symptoms/in-keywords/',
      searchText: 'unrelated gamma quantum leak detected',
      badge: 'Symptom',
    },
    {
      kind: 'autopsy',
      id: 'in-title',
      title: 'Quantum Rendering Failure',
      subtitle: 'Generic description',
      keywords: 'other',
      href: '/autopsies/in-title/',
      searchText: 'quantum rendering failure',
      badge: 'Autopsy #99',
    },
  ];

  it('assigns exact deterministic weights: title (10) > keywords (6) > subtitle (3) > searchText (1)', () => {
    const tokens = tokenizeQuery('quantum');
    expect(scoreSearchItem(sampleItems[3], tokens)).toBe(SEARCH_WEIGHTS.title);
    expect(scoreSearchItem(sampleItems[2], tokens)).toBe(SEARCH_WEIGHTS.keywords);
    expect(scoreSearchItem(sampleItems[1], tokens)).toBe(SEARCH_WEIGHTS.subtitle);
    expect(scoreSearchItem(sampleItems[0], tokens)).toBe(SEARCH_WEIGHTS.searchText);

    const ranked = searchItems(sampleItems, 'quantum');
    expect(ranked.map((r) => r.id)).toEqual([
      'in-title',
      'in-keywords',
      'in-subtitle',
      'in-search-text',
    ]);
  });

  it('requires ALL whitespace-separated tokens to match (AND semantics)', () => {
    const matches = searchItems(sampleItems, 'quantum leak');
    expect(matches.map((r) => r.id)).toEqual(['in-keywords']);

    expect(searchItems(sampleItems, 'quantum nonexistent')).toEqual([]);
  });

  it('sums per-token weights across multiple tokens', () => {
    const item: SearchItem = {
      kind: 'symptom',
      id: 'multi-token',
      title: 'Header overlaps tooltip',
      subtitle: 'Stacking context traps z-index',
      keywords: 'devtools transform',
      href: '/symptoms/multi-token/',
      searchText: 'header overlaps tooltip stacking context traps z-index devtools transform extra',
      badge: 'Symptom',
    };
    const tokens = tokenizeQuery('header transform z-index extra');
    // header (title=10) + transform (keywords=6) + z-index (subtitle=3) + extra (searchText=1) = 20
    expect(scoreSearchItem(item, tokens)).toBe(20);
  });
});

describe('US-16.1: Search index generation, lab parent resolution & zero 404s', () => {
  const concepts = getAllConcepts();
  const autopsies = getAllAutopsies();
  const labs = getAllLabs();
  const vsPairs = extractVsPairs(concepts, autopsies);
  const index = buildSearchIndex();

  it('indexes all 6 entity kinds: concept, autopsy, lab, symptom, vs, digest', () => {
    const kinds = new Set(index.map((item) => item.kind));
    expect(kinds).toEqual(new Set(['concept', 'autopsy', 'lab', 'symptom', 'vs', 'digest']));
    expect(index.filter((i) => i.kind === 'symptom').length).toBe(getAllSymptoms().length);
    expect(index.filter((i) => i.kind === 'vs').length).toBe(vsPairs.length);
    expect(index.filter((i) => i.kind === 'concept').length).toBe(concepts.length);
    expect(index.filter((i) => i.kind === 'autopsy').length).toBe(autopsies.length);
    expect(index.filter((i) => i.kind === 'lab').length).toBe(labs.length);
  });

  it('resolves all 14 autopsy labs to /autopsies/<id>/#failure-simulator and concept labs to /concepts/<id>/#lab', () => {
    const autopsyLabs = labs.filter((l) => {
      const parent = resolveLabParent(l.id, concepts, autopsies);
      return parent?.kind === 'autopsy';
    });
    expect(autopsyLabs.length).toBe(autopsies.length);

    for (const autopsy of autopsies) {
      const labId = autopsy.frontmatter.lab_id ?? autopsy.frontmatter.id;
      const parent = resolveLabParent(labId, concepts, autopsies);
      expect(parent).not.toBeNull();
      expect(parent?.kind).toBe('autopsy');
      expect(parent?.href).toBe(`/autopsies/${autopsy.frontmatter.id}/#failure-simulator`);
    }

    const labItems = index.filter((item) => item.kind === 'lab');
    const autopsyLabItems = labItems.filter((item) =>
      item.href.startsWith('/autopsies/') && item.href.endsWith('/#failure-simulator')
    );
    const conceptLabItems = labItems.filter((item) =>
      item.href.startsWith('/concepts/') && item.href.endsWith('/#lab')
    );

    expect(autopsyLabItems.length).toBe(autopsies.length);
    expect(conceptLabItems.length + autopsyLabItems.length).toBe(labs.length);
  });

  it('emits only valid routes (zero 404s across every item in buildSearchIndex)', () => {
    const validRoutes = new Set<string>([
      '/digest/',
      ...concepts.map((c) => `/concepts/${c.frontmatter.id}/`),
      ...autopsies.map((a) => `/autopsies/${a.frontmatter.id}/`),
      ...getAllSymptoms().map((s) => `/symptoms/${s.frontmatter.id}/`),
      ...vsPairs.map((p) => `/vs/${p.slug}/`),
    ]);

    const invalidHrefs: string[] = [];
    for (const item of index) {
      const basePath = item.href.split('#')[0];
      if (!validRoutes.has(basePath)) {
        invalidHrefs.push(`${item.kind}:${item.id} -> ${item.href}`);
      }
    }

    expect(invalidHrefs).toEqual([]);
  });

  it('returns at least one symptom, one concept, and one autopsy for query "z-index header"', () => {
    const results = searchItems(index, 'z-index header', 12);
    const kinds = new Set(results.map((r) => r.kind));

    expect(kinds.has('symptom')).toBe(true);
    expect(kinds.has('concept')).toBe(true);
    expect(kinds.has('autopsy')).toBe(true);

    expect(results.some((r) => r.kind === 'symptom' && r.id === 'z-index-ignored')).toBe(true);
    expect(results.some((r) => r.kind === 'concept' && r.id === 'css-stacking-context')).toBe(true);
    expect(results.some((r) => r.kind === 'autopsy' && r.id === 'zindex-9999-tooltip-war')).toBe(
      true
    );
  });
});

describe('Search index of quarantined content', () => {
  it('contains only the static agent entry when no content is published', () => {
    const index = buildSearchIndex({
      conceptsInput: [],
      autopsiesInput: [],
      symptomsInput: [],
      vsPairsInput: [],
      includeDigests: false,
      includeStaticPages: true,
    });
    expect(index.map((i) => i.kind)).toEqual(['agent']);
  });
});
