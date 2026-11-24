import React from 'react';
import type { Metadata } from 'next';
import { getAllAutopsies, getAllConcepts } from '@/lib/content-loader';
import { UI_STRINGS } from '@/lib/ui-strings';
import {
  AutopsyIndexClient,
  type AutopsyIndexItem,
} from '@/components/autopsies/AutopsyIndexClient';

import { isListingIndexable, publishedAutopsies } from '@/lib/publication';

const baseMetadata: Metadata = {
  title: 'Architecture Autopsies | frontend.rocks',
  description: UI_STRINGS.autopsies.subtitle,
  alternates: {
    canonical: 'https://frontend.rocks/autopsies/',
  },
  openGraph: {
    title: 'Architecture Autopsies | frontend.rocks',
    description: UI_STRINGS.autopsies.subtitle,
    url: 'https://frontend.rocks/autopsies/',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Architecture Autopsies | frontend.rocks',
    description: UI_STRINGS.autopsies.subtitle,
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    robots: { index: isListingIndexable(publishedAutopsies(getAllAutopsies()).length), follow: true },
  };
}

export default function AutopsiesPage() {
  const autopsies = getAllAutopsies();
  const concepts = getAllConcepts();
  const conceptTitles = new Map(concepts.map((c) => [c.frontmatter.id, c.frontmatter.title]));

  const items: AutopsyIndexItem[] = autopsies.map((a) => ({
    id: a.frontmatter.id,
    caseNumber: a.frontmatter.case_number,
    title: a.frontmatter.title,
    symptom: a.frontmatter.symptom,
    failureMode: a.frontmatter.failure_mode,
    readingTimeMin: a.frontmatter.reading_time_min,
    concepts: [...a.frontmatter.traversed_concepts]
      .sort((x, y) => x.step_order - y.step_order)
      .map((tc) => ({
        id: tc.concept_id,
        title: conceptTitles.get(tc.concept_id) ?? tc.concept_id,
      })),
  }));

  return (
    <div style={{ padding: '28px 0 48px' }}>
      <header style={{ marginBottom: '28px' }}>
        <div
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--accent)',
            marginBottom: '8px',
          }}
        >
          {UI_STRINGS.autopsies.eyebrow}
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(1.7rem, 3vw, 2.3rem)' }}>
          {UI_STRINGS.autopsies.title}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: '68ch', lineHeight: 1.55 }}>
          {UI_STRINGS.autopsies.subtitle}
        </p>
      </header>

      <AutopsyIndexClient autopsies={items} />
    </div>
  );
}
