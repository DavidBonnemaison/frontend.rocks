import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import type { LoadedAutopsy, LoadedConcept } from '@/lib/content-loader';
import type { ProductionSymptomConfig } from '@/config/symptoms';
import type { PageProofStatus } from '@/lib/schemas';
import type { VsPair } from '@/lib/vs-pairs';

const concept = (id: string, status: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: status } }) as unknown as LoadedConcept;
const autopsy = (id: string, status: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: status } }) as unknown as LoadedAutopsy;
const symptom = (slug: string, status: PageProofStatus) =>
  ({ slug, proof_status: status }) as unknown as ProductionSymptomConfig;
const pair = (slug: string, status: PageProofStatus) =>
  ({ slug, proof_status: status }) as unknown as VsPair;

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

describe('publication', () => {
  let pub: typeof import('@/lib/publication');

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-pub-test-'));
    writeProvenFixture(tmpDir, ['a', 's', 'vs-c-vs-d']);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', tmpDir);
    vi.resetModules();
    pub = await import('@/lib/publication');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isPublished only accepts proven', () => {
    expect(pub.isPublished('proven')).toBe(true);
    expect(pub.isPublished('proven', 'a')).toBe(true);
    expect(pub.isPublished('proven', 'missing-claims')).toBe(false);
    expect(pub.isPublished('unverified')).toBe(false);
    expect(pub.isPublished('unverified', 'a')).toBe(false);
  });

  it('publishedConcepts filters a mixed array', () => {
    const out = pub.publishedConcepts([concept('a', 'proven'), concept('b', 'unverified')]);
    expect(out.map((c) => c.frontmatter.id)).toEqual(['a']);
  });

  it('publishedAutopsies and publishedSymptoms filter unverified items', () => {
    expect(pub.publishedAutopsies([autopsy('a', 'unverified')])).toEqual([]);
    expect(pub.publishedSymptoms([symptom('s', 'proven'), symptom('t', 'unverified')])).toHaveLength(1);
  });

  it('publishedVsPairs excludes a pair whose status is unverified', () => {
    const out = pub.publishedVsPairs([pair('a-vs-b', 'unverified'), pair('c-vs-d', 'proven')]);
    expect(out.map((p) => p.slug)).toEqual(['c-vs-d']);
  });

  it('isListingIndexable needs at least one published item', () => {
    expect(pub.isListingIndexable(0)).toBe(false);
    expect(pub.isListingIndexable(1)).toBe(true);
  });

  it('robotsForStatus noindexes unverified pages and keeps follow', () => {
    expect(pub.robotsForStatus('unverified')).toEqual({ index: false, follow: true });
    expect(pub.robotsForStatus('proven')).toEqual({ index: true, follow: true });
    expect(pub.robotsForStatus('proven', 'a')).toEqual({ index: true, follow: true });
    expect(pub.robotsForStatus('proven', 'missing-claims')).toEqual({ index: false, follow: true });
  });
});
