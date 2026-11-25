import { describe, it, expect } from 'vitest';
import { validateConceptGraph } from '@/lib/validators/dag';
import { checkProvenGuard } from '@/lib/publication';
import { validateConceptMdx } from '@/lib/validators/concept-validator';
import {
  validateAutopsyCaseNumberContiguity,
  validateAutopsyMdx,
} from '@/lib/validators/autopsy-validator';
import {
  DOMAIN_VALUES,
  LearningPathsFileSchema,
  RelationSchema,
  type ConceptFrontmatter,
} from '@/lib/schemas';

const baseConcept = (
  id: string,
  relations: ConceptFrontmatter['relations'] = []
): ConceptFrontmatter => ({
  id,
  title: `Concept ${id}`,
  domain: 'rendering-pipeline',
  maturity_status: 'baseline-widely',
  summary_tldr: 'Concise technical summary explaining the exact mechanism in under 280 characters.',
  relations,
  sources: ['https://developer.mozilla.org/en-US/'],
  last_verified_at: '2026-11-15',
  proof_status: 'unverified',
});

describe('validateConceptGraph (DAG & referential integrity)', () => {
  it('passes an acyclic graph with valid relations', () => {
    const concepts = [
      baseConcept('a'),
      baseConcept('b', [{ target_id: 'a', type: 'requires', note: 'B depends on A for layout calculation' }]),
      baseConcept('c', [{ target_id: 'b', type: 'requires', note: 'C depends on B for paint invalidation' }]),
    ];
    const res = validateConceptGraph(concepts);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('detects a cycle in requires relations', () => {
    const concepts = [
      baseConcept('a', [{ target_id: 'b', type: 'requires', note: 'Cycle test note at least 20 chars' }]),
      baseConcept('b', [{ target_id: 'a', type: 'requires', note: 'Cycle test note at least 20 chars' }]),
    ];
    const res = validateConceptGraph(concepts);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.type === 'cycle')).toBe(true);
  });

  it('detects missing target_id', () => {
    const concepts = [
      baseConcept('a', [{ target_id: 'ghost', type: 'under_the_hood', note: 'Missing target test note >= 20 chars' }]),
    ];
    const res = validateConceptGraph(concepts);
    expect(res.valid).toBe(false);
    expect(res.errors[0].type).toBe('missing-target');
  });
});

describe('validateConceptMdx', () => {
  it('validates frontmatter and all 5 mandatory sections', () => {
    const raw = `---
id: sample-node
title: Sample Node
domain: css-layout
web_feature_id: container-queries
summary_tldr: "Short and precise definition of the concept in under 280 characters."
relations: []
sources:
  - "https://developer.mozilla.org/en-US/docs/Web/CSS"
last_verified_at: "2026-11-15"
---

## TL;DR

Concise definition.

## Interactive Lab

Interactive lab description.

## Under the Hood

Internal mechanism.

## Problem Genealogy

Historical timeline.

## Production Pitfalls

Common pitfalls.
`;
    const res = validateConceptMdx(raw, 'sample-node');
    expect(res.valid).toBe(true);
  });

  it('fails if a mandatory section is missing', () => {
    const raw = `---
id: sample-node
title: Sample Node
domain: css-layout
web_feature_id: container-queries
summary_tldr: "Short and precise definition of the concept in under 280 characters."
relations: []
sources:
  - "https://developer.mozilla.org/en-US/docs/Web/CSS"
last_verified_at: "2026-11-15"
---

## TL;DR

Concise definition.
`;
    const res = validateConceptMdx(raw, 'sample-node');
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('EPIC-11 Schemas', () => {
  it('includes security-a11y in DOMAIN_VALUES', () => {
    expect(DOMAIN_VALUES).toContain('security-a11y');
  });

  it('enforces minimum 20 characters on RelationSchema.note', () => {
    const tooShort = RelationSchema.safeParse({
      target_id: 'browser-rendering-pipeline',
      type: 'requires',
      note: 'Too short',
    });
    expect(tooShort.success).toBe(false);

    const valid = RelationSchema.safeParse({
      target_id: 'browser-rendering-pipeline',
      type: 'requires',
      note: 'Layout thrashing interrupts the pipeline before paint.',
    });
    expect(valid.success).toBe(true);
  });

  it('validates LearningPathsFileSchema and rejects paths with fewer than 3 concepts', () => {
    const valid = LearningPathsFileSchema.safeParse({
      paths: [
        {
          id: 'why-ui-drops-frames',
          title: 'Why Your UI Drops Frames at 60 FPS',
          description: 'Trace frame budgets from DOM writes to GPU compositing.',
          estimatedMinutes: 18,
          concepts: ['browser-rendering-pipeline', 'layout-thrashing', 'gpu-compositor-layers'],
        },
      ],
    });
    expect(valid.success).toBe(true);

    const tooFew = LearningPathsFileSchema.safeParse({
      paths: [
        {
          id: 'short-path',
          title: 'Too Short Path',
          description: 'Not enough concepts in this learning path.',
          estimatedMinutes: 10,
          concepts: ['browser-rendering-pipeline', 'layout-thrashing'],
        },
      ],
    });
    expect(tooFew.success).toBe(false);
  });
});

describe('validateAutopsyMdx (EPIC-15 narrative format)', () => {
  const proseBlock = (seed: string) =>
    Array.from({ length: 145 }, (_, i) => `${seed}word${i}`).join(' ');

  const validNarrativeAutopsy = `---
id: sample-autopsy
case_number: 99
title: "Autopsy #99: Sample Narrative Incident"
symptom: "Sample production failure symptom for unit validation."
failure_mode: main-thread-freeze
format: narrative
case_type: composite
cast:
  - julie
  - karim
  - marc
traversed_concepts:
  - concept_id: layout-thrashing
    step_order: 1
    role_in_chain: "Reads and writes interleaved in a synchronous layout loop."
  - concept_id: long-tasks-and-inp
    step_order: 2
    role_in_chain: "Main thread blocks for 180 ms before next frame paint."
  - concept_id: css-custom-properties-cascade
    step_order: 3
    role_in_chain: "Mutating a root variable invalidates styles on 2,400 nodes."
  - concept_id: virtual-dom-reconciliation
    step_order: 4
    role_in_chain: "Unstable inline context object defeats memoization checks."
case_file:
  trigger: "Added a synchronous layout read loop"
  symptom: "180 ms INP freeze on click"
  root_cause: "Interleaved getBoundingClientRect and style writes"
  bad_fixes:
    - label: "Wrapped in React.memo"
      outcome: "Did nothing because style writes still thrashed layout"
  fix: "Batch DOM reads before writes"
  how_to_spot: "Performance panel shows purple Layout bars"
  deleted: "Synchronous height measurement loop"
reading_time_min: 7
sources:
  - "https://web.dev/articles/inp"
last_verified_at: "2026-11-17"
---

## One innocent toggle

Julie shipped a small toolbar button. We tested it on localhost and it ran fast. ${proseBlock('c1')}

## Zero milliseconds saved

Karim wrapped the row in memoization. Our CI suite stayed green, while production still froze. ${proseBlock('c2')}

## Reading the flamegraph

<CausalChainStepper />

We traced [layout thrashing](/concepts/layout-thrashing) and [CSS custom properties](/concepts/css-custom-properties-cascade) feeding [VDOM reconciliation](/concepts/virtual-dom-reconciliation) and [long tasks](/concepts/long-tasks-and-inp) on the main thread. ${proseBlock('c3')}

<FailureSimulator />

## Batching the layout pass

Marc verified the network and we batched all reads before writes. ${proseBlock('c4')}

\`\`\`ts
const h = el.getBoundingClientRect().height;
el.style.minHeight = \`\${h}px\`;
\`\`\`

## The first-try trap

First try failed because our wrapper still read offsetTop mid-loop. ${proseBlock('c5')}

## What stayed in the codebase

<CaseFile />

We deleted the measurement loop and kept the batching helper. ${proseBlock('c6')}
`;

  it('passes a valid narrative autopsy with 6 chapters, cast, case_file, and 3 widgets', () => {
    const res = validateAutopsyMdx(validNarrativeAutopsy, 'sample-autopsy');
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects legacy template markers (- **T+00:00**:, **Golden Rule:**, ### 01 → 02:)', () => {
    const legacy = validNarrativeAutopsy
      .replace('Julie shipped a small toolbar button.', '- **T+00:00**: Julie shipped a button.')
      .replace('Karim wrapped the row in memoization.', '### 01 → 02: Karim wrapped it.')
      .replace('We deleted the measurement loop', '**Golden Rule:** Never thrash layout.');
    const res = validateAutopsyMdx(legacy, 'sample-autopsy');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('- **T+00:00**:'))).toBe(true);
    expect(res.errors.some((e) => e.includes('### 01 → 02:'))).toBe(true);
    expect(res.errors.some((e) => e.includes('**Golden Rule:**'))).toBe(true);
  });
});

describe('EPIC-15 Domain & Cast Diversity', () => {
  it('includes software-architecture in DOMAIN_VALUES and UI_STRINGS.domains', async () => {
    expect(DOMAIN_VALUES).toContain('software-architecture');
    const { UI_STRINGS } = await import('../src/lib/ui-strings');
    expect(UI_STRINGS.domains['software-architecture']).toBe('Software Architecture');
  });

  it('rejects consecutive autopsies with identical sorted cast combinations', async () => {
    const { validateAutopsyCastDiversity } = await import('../src/lib/validators/autopsy-validator');
    const bad = validateAutopsyCastDiversity([
      { id: 'a1', case_number: 1, cast: ['julie', 'karim'] },
      { id: 'a2', case_number: 2, cast: ['karim', 'julie'] },
    ]);
    expect(bad.valid).toBe(false);
    expect(bad.errors[0]).toContain('Autopsy #2');

    const good = validateAutopsyCastDiversity([
      { id: 'a1', case_number: 1, cast: ['julie', 'karim'] },
      { id: 'a2', case_number: 2, cast: ['julie', 'karim', 'marc'] },
    ]);
    expect(good.valid).toBe(true);
  });
});

describe('US-16.2: Autopsy case_number Contiguity, Featured Symptoms & Dynamic Counter', () => {
  it('accepts contiguous 1..N case_numbers regardless of input order', () => {
    const res = validateAutopsyCaseNumberContiguity([
      { id: 'a3', case_number: 3 },
      { id: 'a1', case_number: 1 },
      { id: 'a2', case_number: 2 },
    ]);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);

    expect(validateAutopsyCaseNumberContiguity([]).valid).toBe(true);
  });

  it('rejects duplicate case_numbers', () => {
    const res = validateAutopsyCaseNumberContiguity([
      { id: 'a1', case_number: 1 },
      { id: 'a2', case_number: 2 },
      { id: 'a2-dup', case_number: 2 },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Duplicate autopsy case_number #2'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Missing autopsy case_number #3'))).toBe(true);
  });

  it('rejects gaps in case_numbers (e.g. missing #14 when #15 exists)', () => {
    const res = validateAutopsyCaseNumberContiguity([
      { id: 'a1', case_number: 1 },
      { id: 'a2', case_number: 2 },
      { id: 'a4', case_number: 4 },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Missing autopsy case_number #3'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Out-of-range autopsy case_number #4'))).toBe(true);
  });

  it('exposes 6 featured symptoms from PRODUCTION_SYMPTOMS and dynamic autopsy count label', async () => {
    const { getFeaturedSymptoms } = await import('../src/config/symptoms');
    const { UI_STRINGS } = await import('../src/lib/ui-strings');
    expect(getFeaturedSymptoms()).toHaveLength(6);
    expect(UI_STRINGS.autopsies.viewAllAutopsies(14)).toBe('Browse all 14 Architecture Autopsies');
  });
});




describe('checkProvenGuard (proven requires a claims file)', () => {
  it('accepts unverified pages without a claims file', () => {
    expect(checkProvenGuard([{ id: 'a', proof_status: 'unverified' }], () => false)).toEqual([]);
  });

  it('rejects a proven page with no claims file', () => {
    const errors = checkProvenGuard([{ id: 'a', proof_status: 'proven' }], () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('[proof] a is marked proven but has no content/claims/a.claims.json');
  });

  it('accepts a proven page whose claims file exists', () => {
    expect(checkProvenGuard([{ id: 'a', proof_status: 'proven' }], (id) => id === 'a')).toEqual([]);
  });
});
