import type { PageProofStatus } from './schemas';
import type { LoadedConcept, LoadedAutopsy } from './content-loader';
import type { ProductionSymptomConfig } from '../config/symptoms';
import type { VsPair } from './vs-pairs';
import { getEffectivePageStatus } from './proof/page-status';

/**
 * Single place that decides whether a page is published.
 * When `pageId` is provided, delegates to `getEffectivePageStatus` (claims + latest.json + 7-day grace).
 */
export function isPublished(status: PageProofStatus, pageId?: string): boolean {
  if (status !== 'proven') return false;
  if (!pageId) return true;
  return getEffectivePageStatus(pageId, status).status !== 'unverified';
}

export function publishedConcepts(all: LoadedConcept[]): LoadedConcept[] {
  return all.filter((c) => isPublished(c.frontmatter.proof_status, c.frontmatter.id));
}

export function publishedAutopsies(all: LoadedAutopsy[]): LoadedAutopsy[] {
  return all.filter((a) => isPublished(a.frontmatter.proof_status, a.frontmatter.id));
}

export function publishedSymptoms(all: ProductionSymptomConfig[]): ProductionSymptomConfig[] {
  return all.filter((s) => isPublished(s.proof_status, s.slug));
}

export function publishedVsPairs(all: VsPair[]): VsPair[] {
  return all.filter((p) => isPublished(p.proof_status, `vs-${p.slug}`));
}

/** A listing page is indexable when it shows at least one published item. */
export function isListingIndexable(publishedCount: number): boolean {
  return publishedCount > 0;
}

/** Next.js `robots` metadata for a detail page. */
export function robotsForStatus(
  status: PageProofStatus,
  pageId?: string
): { index: boolean; follow: boolean } {
  return { index: isPublished(status, pageId), follow: true };
}

/** Status of a /vs/ pair: published only when both concepts are published. */
export function vsPairStatus(
  primary: LoadedConcept,
  secondary: LoadedConcept
): PageProofStatus {
  return isPublished(primary.frontmatter.proof_status, primary.frontmatter.id) &&
    isPublished(secondary.frontmatter.proof_status, secondary.frontmatter.id)
    ? 'proven'
    : 'unverified';
}

/**
 * Guard: a page can be marked `proven` only if its
 * `content/claims/<page-id>.claims.json` file exists. Returns error messages.
 */
export function checkProvenGuard(
  pages: Array<{ id: string; proof_status: PageProofStatus }>,
  claimsFileExists: (pageId: string) => boolean
): string[] {
  return pages
    .filter((p) => p.proof_status === 'proven' && !claimsFileExists(p.id))
    .map(
      (p) =>
        `[proof] ${p.id} is marked proven but has no content/claims/${p.id}.claims.json`
    );
}
