import React from 'react';
import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { extractVsPairs } from '@/lib/vs-pairs';
import { SITE_URL } from '@/lib/seo-schema';
import { VsHubClient, type VsHubItem } from '@/components/vs/VsHubClient';

import { isListingIndexable, publishedVsPairs } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Compare Primitives | frontend.rocks',
  description:
    'Filterable index of mechanical X vs Y comparisons: native browser replacements for legacy patterns and architectural trade-offs across the web platform.',
  alternates: {
    canonical: `${SITE_URL}/vs/`,
  },
  openGraph: {
    title: 'Compare Primitives | frontend.rocks',
    description:
      'Filterable index of mechanical X vs Y comparisons: native browser replacements for legacy patterns and architectural trade-offs across the web platform.',
    url: `${SITE_URL}/vs/`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compare Primitives | frontend.rocks',
    description:
      'Filterable index of mechanical X vs Y comparisons: native browser replacements for legacy patterns and architectural trade-offs across the web platform.',
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedVsPairs(extractVsPairs()).length), follow: true },
  };
}

export default function VsHubPage() {
  const pairs = extractVsPairs();

  const items: VsHubItem[] = pairs.map((pair) => {
    const pFm = pair.primary.frontmatter;
    const sFm = pair.secondary.frontmatter;
    return {
      slug: pair.slug,
      relationType: pair.relationType,
      note: pair.note,
      primary: {
        id: pFm.id,
        title: pFm.title,
        domain: pFm.domain,
        maturityStatus: pFm.maturity_status,
      },
      secondary: {
        id: sFm.id,
        title: sFm.title,
        domain: sFm.domain,
        maturityStatus: sFm.maturity_status,
      },
      domains: Array.from(new Set([pFm.domain, sFm.domain])),
    };
  });

  return (
    <div className="vs-hub-page">
      <header className="vs-hub-header">
        <div className="vs-hub-eyebrow">
          <Scale size={14} aria-hidden="true" />
          <span>Mechanical Comparisons · {items.length} Pairs</span>
        </div>
        <h1 className="vs-hub-title">Compare Primitives</h1>
        <p className="vs-hub-subtitle">
          Side-by-side mechanical trade-offs extracted directly from the knowledge graph. Filter
          native replacements for legacy patterns or compare competing primitives by domain.
        </p>
      </header>

      <VsHubClient pairs={items} />
    </div>
  );
}
