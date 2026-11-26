import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LoadedAutopsy, LoadedConcept } from '../src/lib/content-loader';
import type { ProductionSymptomConfig } from '../src/config/symptoms';
import type { PageProofStatus } from '../src/lib/schemas';
import type { VsPair } from '../src/lib/vs-pairs';

const concept = (id: string, s: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: s } }) as unknown as LoadedConcept;
const autopsy = (id: string, s: PageProofStatus) =>
  ({ frontmatter: { id, proof_status: s } }) as unknown as LoadedAutopsy;
const symptom = (slug: string, s: PageProofStatus) =>
  ({ slug, proof_status: s }) as unknown as ProductionSymptomConfig;
const pair = (slug: string, s: PageProofStatus) => ({ slug, proof_status: s }) as unknown as VsPair;

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

describe('buildQuarantineUrls', () => {
  let buildQuarantineUrls: typeof import('../scripts/maintenance/quarantine-urls').buildQuarantineUrls;
  let urls: string[];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-maint-test-'));
    writeProvenFixture(tmpDir, ['p', 'py', 'ps', 'vs-p-vs-q']);
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', tmpDir);
    vi.resetModules();
    ({ buildQuarantineUrls } = await import('../scripts/maintenance/quarantine-urls'));
    urls = buildQuarantineUrls({
      concepts: [concept('a', 'unverified'), concept('p', 'proven')],
      autopsies: [autopsy('x', 'unverified'), autopsy('py', 'proven')],
      symptoms: [symptom('s', 'unverified'), symptom('ps', 'proven')],
      vsPairs: [pair('a-vs-b', 'unverified'), pair('p-vs-q', 'proven')],
    });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists unverified detail pages', () => {
    expect(urls).toContain('https://frontend.rocks/concepts/a/');
    expect(urls).toContain('https://frontend.rocks/autopsies/x/');
    expect(urls).toContain('https://frontend.rocks/symptoms/s/');
    expect(urls).toContain('https://frontend.rocks/vs/a-vs-b/');
  });

  it('never lists a proven page', () => {
    for (const proven of ['concepts/p/', 'autopsies/py/', 'symptoms/ps/', 'vs/p-vs-q/']) {
      expect(urls).not.toContain(`https://frontend.rocks/${proven}`);
    }
  });

  it('lists only listing pages that are noindex', () => {
    expect(urls).not.toContain('https://frontend.rocks/graph/'); // one proven concept
    expect(urls).toContain('https://frontend.rocks/digest/'); // always noindex
    const none = buildQuarantineUrls({ concepts: [], autopsies: [], symptoms: [], vsPairs: [] });
    expect(none).toHaveLength(7);
  });
});
