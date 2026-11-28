import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo-schema';

export const metadata: Metadata = {
  title: 'This page was retired · frontend.rocks',
  description: 'This page was retired because it did not pass automated verification.',
  alternates: {
    canonical: `${SITE_URL}/gone/`,
  },
  robots: { index: false, follow: true },
};

export default function GonePage() {
  return (
    <article className="concept-article" style={{ maxWidth: '720px', margin: '0 auto' }}>
      <h1 className="concept-title">This page was retired</h1>
      <p>
        This page did not pass automated verification against browser engines, primary
        specifications, or engine source code, so it was removed instead of staying online
        unverified.
      </p>
      <p>
        You can read <Link href="/proof/">how proofs work</Link> or browse verified pages in the{' '}
        <Link href="/index-list/">concept index</Link>.
      </p>
    </article>
  );
}
