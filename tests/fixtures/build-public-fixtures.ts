/**
 * Regenerates tests/fixtures/public/ from synthetic fixture objects (never real content).
 * Markdown twins and the catalog Markdown go through the real build functions so the format
 * stays faithful to the code. The audit rules are written by hand: the real catalog builder
 * is tied to the real rule blueprints.
 *
 * Usage: npx tsx tests/fixtures/build-public-fixtures.ts
 */
import fs from 'fs';
import path from 'path';
import type { LoadedAutopsy, LoadedConcept } from '../../src/lib/content-loader';
import type { ConceptFrontmatter } from '../../src/lib/schemas';
import {
  AuditRulesCatalogSchema,
  renderAuditCatalogMarkdown,
  type AuditRulesCatalog,
} from '../../src/lib/audit-rules';
import {
  buildAutopsyMarkdownTwin,
  buildConceptMarkdownTwin,
  buildVsMarkdownTwin,
  SITE_URL,
} from '../../src/lib/seo-exports';
import { extractVsPairs } from '../../src/lib/vs-pairs';

const OUT_DIR = path.join(__dirname, 'public');

function makeConcept(
  frontmatter: Partial<ConceptFrontmatter> & Pick<ConceptFrontmatter, 'id' | 'title' | 'relations'>
): LoadedConcept {
  const fm: ConceptFrontmatter = {
    domain: 'rendering-pipeline',
    maturity_status: 'baseline-widely',
    summary_tldr: `Synthetic summary for ${frontmatter.title}, used only by the test fixtures.`,
    sources: ['https://developer.mozilla.org/en-US/'],
    last_verified_at: '2026-01-01',
    proof_status: 'proven',
    ...frontmatter,
  };
  return {
    frontmatter: fm,
    body: `## Under the Hood\n\nFixture mechanics of ${fm.title}.\n\n## Production Pitfalls\n\nFixture pitfalls of ${fm.title}.\n`,
    sections: {
      tl_dr: fm.summary_tldr,
      interactive_lab: '',
      under_the_hood: `Fixture mechanics of ${fm.title}.`,
      genealogy: '',
      production_pitfalls: `Fixture pitfalls of ${fm.title}.`,
    },
    lab: null,
    evidence: null,
    claims: null,
    filePath: `fixtures/${fm.id}.mdx`,
  };
}

const conceptC = makeConcept({
  id: 'fixture-concept-c',
  title: 'Fixture Concept C',
  relations: [],
});
const conceptB = makeConcept({
  id: 'fixture-concept-b',
  title: 'Fixture Concept B',
  maturity_status: 'superseded',
  superseded_by: ['fixture-concept-a'],
  relations: [],
});
const conceptA = makeConcept({
  id: 'fixture-concept-a',
  title: 'Fixture Concept A',
  relations: [
    {
      target_id: 'fixture-concept-b',
      type: 'replaces',
      note: 'Fixture A replaces fixture B in this synthetic graph.',
    },
    {
      target_id: 'fixture-concept-c',
      type: 'requires',
      note: 'Fixture A requires fixture C in this synthetic graph.',
    },
  ],
});
const concepts = [conceptA, conceptB, conceptC];

const autopsy = {
  frontmatter: {
    id: 'fixture-autopsy',
    case_number: 1,
    title: 'Fixture Autopsy: a blocked open that never resolves',
    symptom: 'A synthetic request hangs forever when a second tab keeps the old version open.',
    failure_mode: 'cascading-latency',
    format: 'narrative',
    case_type: 'composite',
    cast: ['julie', 'karim'],
    traversed_concepts: [
      {
        concept_id: 'fixture-concept-a',
        step_order: 1,
        role_in_chain: 'Fixture concept A is the first step of the synthetic causal chain.',
      },
      {
        concept_id: 'fixture-concept-b',
        step_order: 2,
        role_in_chain: 'Fixture concept B is the second step of the synthetic causal chain.',
      },
    ],
    case_file: {
      trigger: 'A synthetic upgrade runs while another tab still holds the old version.',
      symptom: 'The synthetic open request stays pending and the UI never renders.',
      root_cause: 'The old tab never releases its handle, so the new open request stays blocked.',
      bad_fixes: [
        { label: 'Retry in a loop', outcome: 'Adds more pending requests behind the blocked one.' },
        { label: 'Reload the page', outcome: 'Hides the symptom until the next upgrade.' },
      ],
      fix: 'Close the handle on onversionchange so the upgrade can proceed.',
      how_to_spot: 'DevTools shows a pending request that never settles after an upgrade.',
    },
    reading_time_min: 5,
    sources: ['https://developer.mozilla.org/en-US/'],
    last_verified_at: '2026-01-01',
    proof_status: 'proven',
  },
  body: '## The Incident\n\nA fixture incident.\n',
  sections: {
    incident_report: 'A fixture incident.',
    causal_chain: '',
    failure_simulator: '',
    layer_dissection: '',
    architectural_fix: 'Close the handle on onversionchange.',
  },
  sectionHeadings: {
    incident_report: 'The Incident',
    causal_chain: 'Causal Chain',
    failure_simulator: 'Failure Simulator',
    layer_dissection: 'Layer Dissection',
    architectural_fix: 'Architectural Fix',
  },
  lab: null,
  filePath: 'fixtures/fixture-autopsy.mdx',
} as unknown as LoadedAutopsy;

const titles = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));
const pairs = extractVsPairs(concepts, [autopsy]);
if (pairs.length !== 1) throw new Error(`Expected exactly 1 fixture pair, got ${pairs.length}`);

const catalog: AuditRulesCatalog = AuditRulesCatalogSchema.parse({
  generated_at: '2026-01-01T00:00:00.000Z',
  version: '1.0.0',
  rule_count: 2,
  categories: ['IndexedDB & Storage', 'Rendering & CSS Compositor'],
  rules: [
    {
      id: 'fixture-blocked-open-without-handler',
      title: 'Fixture rule: blocked open without a version handler',
      category: 'IndexedDB & Storage',
      severity: 'high',
      detection_signals: ['Synthetic open call without a version change handler'],
      pattern_hints: ['fixtureOpen(', 'onblocked'],
      trigger: 'A synthetic upgrade runs while another tab still holds the old version.',
      root_cause: 'The old tab never releases its handle, so the new open request stays blocked.',
      how_to_spot: 'DevTools shows a pending request that never settles after an upgrade.',
      fix: 'Close the handle on onversionchange so the upgrade can proceed.',
      autopsy_ids: ['fixture-autopsy'],
      concept_ids: ['fixture-concept-a', 'fixture-concept-b'],
      symptom_slugs: [],
      canonical_urls: {
        autopsies: [`${SITE_URL}/autopsies/fixture-autopsy/`],
        concepts: [
          `${SITE_URL}/concepts/fixture-concept-a/`,
          `${SITE_URL}/concepts/fixture-concept-b/`,
        ],
        symptoms: [],
      },
    },
    {
      id: 'fixture-layer-trapped-in-context',
      title: 'Fixture rule: layer value trapped in an isolated context',
      category: 'Rendering & CSS Compositor',
      severity: 'medium',
      detection_signals: ['Synthetic layer value ignored inside an isolated parent'],
      pattern_hints: ['fixture-layer', 'isolated'],
      trigger: 'A synthetic parent creates an isolated context around the child.',
      root_cause: 'The child value only competes inside the isolated parent context.',
      how_to_spot: 'The computed value is high but the element paints underneath a sibling.',
      fix: 'Lift the child out of the isolated parent or isolate the sibling.',
      autopsy_ids: [],
      concept_ids: ['fixture-concept-c'],
      symptom_slugs: ['fixture-symptom'],
      canonical_urls: {
        autopsies: [],
        concepts: [`${SITE_URL}/concepts/fixture-concept-c/`],
        symptoms: [`${SITE_URL}/symptoms/fixture-symptom/`],
      },
    },
  ],
});

const graph = {
  generated_at: '2026-01-01T00:00:00.000Z',
  node_count: concepts.length,
  nodes: concepts.map((c) => ({
    id: c.frontmatter.id,
    title: c.frontmatter.title,
    domain: c.frontmatter.domain,
    maturity_status: c.frontmatter.maturity_status,
    superseded_by: c.frontmatter.superseded_by ?? [],
    summary_tldr: c.frontmatter.summary_tldr,
    last_verified_at: c.frontmatter.last_verified_at,
    url: `${SITE_URL}/concepts/${c.frontmatter.id}/`,
  })),
  edges: concepts.flatMap((c) =>
    c.frontmatter.relations.map((r) => ({
      source: c.frontmatter.id,
      target: r.target_id,
      type: r.type,
      note: r.note,
    }))
  ),
};

function write(rel: string, content: string): void {
  const full = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
write('graph.json', `${JSON.stringify(graph, null, 2)}\n`);
write('audit-rules.json', `${JSON.stringify(catalog, null, 2)}\n`);
write('audit-catalog.md', renderAuditCatalogMarkdown(catalog));
// Concept C has no twin on purpose: it is in graph.json only (deployment inconsistency case).
write('concepts/fixture-concept-a.md', buildConceptMarkdownTwin(conceptA, titles));
write('concepts/fixture-concept-b.md', buildConceptMarkdownTwin(conceptB, titles));
write('autopsies/fixture-autopsy.md', buildAutopsyMarkdownTwin(autopsy, titles));
write(`vs/${pairs[0].slug}.md`, buildVsMarkdownTwin(pairs[0], titles));
console.log(`Fixtures written to ${OUT_DIR}`);
