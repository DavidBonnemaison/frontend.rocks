import type { LoadedAutopsy, LoadedConcept } from '../../src/lib/content-loader';
import type { ProductionSymptomConfig } from '../../src/config/symptoms';
import type { VsPair } from '../../src/lib/vs-pairs';
import { isListingIndexable, isPublished } from '../../src/lib/publication';

const SITE_URL = 'https://frontend.rocks';

/**
 * URLs of every unverified detail page plus the listing pages that are noindex.
 * Takes ALL content; a published page never appears.
 */
export function buildQuarantineUrls(input: {
  concepts: LoadedConcept[];
  autopsies: LoadedAutopsy[];
  symptoms: ProductionSymptomConfig[];
  vsPairs: VsPair[];
}): string[] {
  const { concepts, autopsies, symptoms, vsPairs } = input;

  const publishedCount = {
    concepts: concepts.filter((c) => isPublished(c.frontmatter.proof_status, c.frontmatter.id)).length,
    autopsies: autopsies.filter((a) => isPublished(a.frontmatter.proof_status, a.frontmatter.id)).length,
    symptoms: symptoms.filter((s) => isPublished(s.proof_status, s.slug)).length,
    vsPairs: vsPairs.filter((p) => isPublished(p.proof_status, `vs-${p.slug}`)).length,
  };

  const urls: string[] = [
    ...concepts
      .filter((c) => !isPublished(c.frontmatter.proof_status, c.frontmatter.id))
      .map((c) => `${SITE_URL}/concepts/${c.frontmatter.id}/`),
    ...autopsies
      .filter((a) => !isPublished(a.frontmatter.proof_status, a.frontmatter.id))
      .map((a) => `${SITE_URL}/autopsies/${a.frontmatter.id}/`),
    ...symptoms
      .filter((s) => !isPublished(s.proof_status, s.slug))
      .map((s) => `${SITE_URL}/symptoms/${s.slug}/`),
    ...vsPairs
      .filter((p) => !isPublished(p.proof_status, `vs-${p.slug}`))
      .map((p) => `${SITE_URL}/vs/${p.slug}/`),
  ];

  const listings: Array<[string, number]> = [
    ['/autopsies/', publishedCount.autopsies],
    ['/symptoms/', publishedCount.symptoms],
    ['/vs/', publishedCount.vsPairs],
    ['/graph/', publishedCount.concepts],
    ['/index-list/', publishedCount.concepts],
    ['/obsolescence/', publishedCount.concepts],
    ['/digest/', 0], // digests are never published
  ];
  for (const [route, count] of listings) {
    if (!isListingIndexable(count)) urls.push(`${SITE_URL}${route}`);
  }
  return urls;
}
