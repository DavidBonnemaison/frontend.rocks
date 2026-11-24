import { describe, expect, it } from 'vitest';
import { buildQuarantineUrls } from '../scripts/maintenance/quarantine-urls';
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

describe('buildQuarantineUrls', () => {
  const urls = buildQuarantineUrls({
    concepts: [concept('a', 'unverified'), concept('p', 'proven')],
    autopsies: [autopsy('x', 'unverified'), autopsy('py', 'proven')],
    symptoms: [symptom('s', 'unverified'), symptom('ps', 'proven')],
    vsPairs: [pair('a-vs-b', 'unverified'), pair('p-vs-q', 'proven')],
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
