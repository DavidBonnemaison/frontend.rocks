import type { Claim } from './claim-schema';
import { getClaimsForPage } from './claims-loader';
import { getAllPageRefs, type PageKind, type PageRef } from './page-registry';
import { getEffectivePageStatus } from './page-status';

export interface PublishedClaimEntry {
  claim: Claim;
  pageId: string;
  pageKind: PageKind;
  pageUrl: string;
}

export function pageUrlFor(kind: PageKind, pageId: string): string {
  switch (kind) {
    case 'concept':
      return `/concepts/${pageId}/`;
    case 'autopsy':
      return `/autopsies/${pageId}/`;
    case 'symptom':
      return `/symptoms/${pageId}/`;
    case 'vs': {
      const slug = pageId.startsWith('vs-') ? pageId.slice(3) : pageId;
      return `/vs/${slug}/`;
    }
    case 'deep-dive':
      return `/deep-dives/${pageId}/`;
    case 'myth':
      return `/myths/${pageId}/`;
    case 'changelog':
      return `/changelog/${pageId}/`;
  }
}

export function getPublishedPageRefs(now: Date = new Date()): PageRef[] {
  const { pages } = getAllPageRefs();
  return pages.filter(
    (p) => getEffectivePageStatus(p.id, p.proofStatus, now).status !== 'unverified'
  );
}

/**
 * Returns every claim belonging to a published page (effective status `proven` or `degraded`),
 * sorted deterministically by `claim.id`.
 */
export function getAllPublishedClaims(now: Date = new Date()): Claim[] {
  return getAllPublishedClaimEntries(now).map((entry) => entry.claim);
}

export function getAllPublishedClaimEntries(now: Date = new Date()): PublishedClaimEntry[] {
  const entries: PublishedClaimEntry[] = [];
  for (const page of getPublishedPageRefs(now)) {
    const file = getClaimsForPage(page.id);
    if (!file) continue;
    const pageUrl = pageUrlFor(page.kind, page.id);
    for (const claim of file.claims) {
      entries.push({
        claim,
        pageId: page.id,
        pageKind: page.kind,
        pageUrl,
      });
    }
  }
  entries.sort((a, b) => a.claim.id.localeCompare(b.claim.id));
  return entries;
}
