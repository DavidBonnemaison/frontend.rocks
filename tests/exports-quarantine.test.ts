import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LoadedConcept } from '@/lib/content-loader';
import type { ConceptFrontmatter, PageProofStatus } from '@/lib/schemas';
import type { LoadedSymptom } from '@/lib/symptoms/loader';

function concept(
  id: string,
  status: PageProofStatus,
  relations: ConceptFrontmatter['relations'] = []
): LoadedConcept {
  return {
    frontmatter: {
      id,
      title: `Concept ${id}`,
      domain: 'rendering-pipeline',
      maturity_status: 'baseline-widely',
      summary_tldr: 'Synthetic summary used by the quarantine tests only.',
      relations,
      sources: ['https://developer.mozilla.org/en-US/'],
      last_verified_at: '2026-01-01',
      proof_status: status,
    },
    body: '',
    sections: {
      tl_dr: 'x',
      interactive_lab: '',
      under_the_hood: 'Under the hood text.',
      genealogy: '',
      production_pitfalls: 'Pitfalls text.',
    },
    lab: null,
    evidence: null,
    claims: null,
    filePath: `fixtures/${id}.mdx`,
  };
}

const contrast = (target: string) => [
  { target_id: target, type: 'contrasts_with' as const, note: 'Synthetic contrast note for tests.' },
];

let tmpDir: string;

function writeProvenFixture(dir: string, pageIds: string[]): void {
  const claimsDir = path.join(dir, 'claims');
  const resultsDir = path.join(dir, '.proof-results');
  fs.mkdirSync(claimsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  const claimsResults: Record<string, unknown> = {};
  for (const pageId of pageIds) {
    const claimId = `${pageId}/fact`;
    fs.writeFileSync(
      path.join(claimsDir, `${pageId}.claims.json`),
      JSON.stringify({
        pageId,
        claims: [
          {
            id: claimId,
            type: 'normative',
            statement: `Canonical proven statement for ${pageId} fixture.`,
            proof: {
              kind: 'spec-quote',
              url: 'https://drafts.csswg.org/css-contain-3/',
              anchor: 'size-container',
              quote: 'A query container for size queries must establish inline-size containment.',
            },
          },
        ],
      })
    );
    claimsResults[claimId] = {
      status: 'proven',
      proofKind: 'spec-quote',
      engines: null,
      checkedAt: '2026-12-01T00:00:00.000Z',
      provenSince: '2026-11-01T00:00:00.000Z',
      failingSince: null,
      reason: null,
      detail: null,
    };
  }

  fs.writeFileSync(
    path.join(resultsDir, 'latest.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-12-01T00:00:00.000Z',
      runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
      engines: { chromium: '159.0', firefox: '159.0', webkit: '27.2' },
      experiments: {},
      experimentMeta: {},
      claims: claimsResults,
      pages: {},
      demotedPages: {},
    })
  );
}

describe('selectPublishableContent', () => {
  let selectPublishableContent: typeof import('@/lib/publishable-content').selectPublishableContent;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-quarantine-test-'));
    writeProvenFixture(tmpDir, ['a', 'b', 'vs-a-vs-b']);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', tmpDir);
    vi.resetModules();
    ({ selectPublishableContent } = await import('@/lib/publishable-content'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a pair only when both concepts are proven', () => {
    const out = selectPublishableContent({
      concepts: [
        concept('a', 'proven', contrast('b')),
        concept('b', 'proven', contrast('a')),
        concept('c', 'unverified', contrast('a')),
      ],
      autopsies: [],
      symptoms: [],
    });
    expect(out.concepts.map((c) => c.frontmatter.id)).toEqual(['a', 'b']);
    expect(out.vsPairs.map((p) => p.slug)).toEqual(['a-vs-b']);
  });

  it('excludes a pair with one unverified side', () => {
    const out = selectPublishableContent({
      concepts: [concept('a', 'proven', contrast('c')), concept('c', 'unverified')],
      autopsies: [],
      symptoms: [],
    });
    expect(out.vsPairs).toEqual([]);
  });

  it('excludes unverified symptoms', () => {
    const symptoms = [
      { frontmatter: { id: 's', proof_status: 'unverified' } },
    ] as unknown as LoadedSymptom[];
    expect(selectPublishableContent({ concepts: [], autopsies: [], symptoms }).symptoms).toEqual([]);
  });

  it('handles empty input', () => {
    expect(selectPublishableContent({ concepts: [], autopsies: [], symptoms: [] })).toEqual({
      concepts: [],
      autopsies: [],
      symptoms: [],
      vsPairs: [],
    });
  });
});
