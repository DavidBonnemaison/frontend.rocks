import React from 'react';
import { getAllConcepts } from '@/lib/content-loader';
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';
import type { Metadata } from 'next';
import { UI_STRINGS } from '@/lib/ui-strings';

import { isListingIndexable, publishedConcepts } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Interactive Knowledge Graph | frontend.rocks',
  description: UI_STRINGS.graph.subtitle,
  alternates: {
    canonical: 'https://frontend.rocks/graph/',
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedConcepts(getAllConcepts()).length), follow: true },
  };
}

export default function GraphPage() {
  const concepts = getAllConcepts().map((c) => ({
    id: c.frontmatter.id,
    title: c.frontmatter.title,
    domain: c.frontmatter.domain,
    maturity_status: c.frontmatter.maturity_status,
    summary_tldr: c.frontmatter.summary_tldr,
    relations: c.frontmatter.relations,
  }));

  return (
    <div style={{ padding: '28px 0 64px' }}>
      <h1 style={{ margin: '0 0 6px' }}>{UI_STRINGS.graph.title}</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '20px' }}>
        {UI_STRINGS.graph.subtitle}
      </p>
      <KnowledgeGraph nodes={concepts} />
    </div>
  );
}
