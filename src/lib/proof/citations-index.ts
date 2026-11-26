import fs from 'node:fs';
import path from 'node:path';
import { getAutopsyById, getConceptById } from '../content-loader';
import { SITE_ROOT } from '../paths';
import { extractClaimReferences, toClaimId } from './coverage/claim-refs';
import { getPublishedPageRefs, pageUrlFor } from './published-claims';
import type { PageRef } from './page-registry';

export interface CitingPage {
  pageId: string;
  title: string;
  href: string;
}

let cachedIndex: Map<string, CitingPage[]> | null = null;

function titleForPage(page: PageRef): string {
  if (page.kind === 'concept') {
    return getConceptById(page.id)?.frontmatter.title ?? page.id;
  }
  if (page.kind === 'autopsy') {
    return getAutopsyById(page.id)?.frontmatter.title ?? page.id;
  }
  return page.id;
}

function buildCitationsIndex(): Map<string, CitingPage[]> {
  const index = new Map<string, Map<string, CitingPage>>();
  const publishedPages = getPublishedPageRefs();

  for (const page of publishedPages) {
    if (!page.mdxPath) continue;
    const absPath = path.join(SITE_ROOT, page.mdxPath);
    if (!fs.existsSync(absPath)) continue;
    let refs: ReturnType<typeof extractClaimReferences>;
    try {
      refs = extractClaimReferences(fs.readFileSync(absPath, 'utf-8'));
    } catch {
      continue;
    }

    const citing: CitingPage = {
      pageId: page.id,
      title: titleForPage(page),
      href: pageUrlFor(page.kind, page.id),
    };

    for (const r of refs) {
      const fullId = toClaimId(page.id, r.ref);
      let byPage = index.get(fullId);
      if (!byPage) {
        byPage = new Map();
        index.set(fullId, byPage);
      }
      byPage.set(page.id, citing);
    }
  }

  const out = new Map<string, CitingPage[]>();
  for (const [claimId, byPage] of index.entries()) {
    out.set(
      claimId,
      [...byPage.values()].sort((a, b) => a.pageId.localeCompare(b.pageId))
    );
  }
  return out;
}

export function getPagesCitingClaim(claimId: string): CitingPage[] {
  if (!cachedIndex) {
    cachedIndex = buildCitationsIndex();
  }
  return cachedIndex.get(claimId) ?? [];
}

export function resetCitationsIndexCache(): void {
  cachedIndex = null;
}
