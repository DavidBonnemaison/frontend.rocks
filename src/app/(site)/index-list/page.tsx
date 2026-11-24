import React from 'react';
import { getAllConcepts } from '@/lib/content-loader';
import type { Metadata } from 'next';
import { ConceptIndex } from '@/components/graph/ConceptIndex';

import { isListingIndexable, publishedConcepts } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Structured Concept Index | frontend.rocks',
  description: 'Fast keyboard and mobile navigation across the full frontend.rocks concept corpus.',
  alternates: {
    canonical: 'https://frontend.rocks/index-list/',
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedConcepts(getAllConcepts()).length), follow: true },
  };
}

export default function IndexListPage() {
  const concepts = getAllConcepts().map((c) => ({
    id: c.frontmatter.id,
    title: c.frontmatter.title,
    domain: c.frontmatter.domain,
    maturity_status: c.frontmatter.maturity_status,
    summary_tldr: c.frontmatter.summary_tldr,
    relations: c.frontmatter.relations,
  }));

  return (
    <div style={{ padding: '32px 0 64px' }}>
      <h1 style={{ margin: '0 0 8px' }}>Structured Concept Index</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Fast keyboard and mobile navigation across the full corpus ({concepts.length} concepts).
      </p>
      <ConceptIndex nodes={concepts} />
    </div>
  );
}
