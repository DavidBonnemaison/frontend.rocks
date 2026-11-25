import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — frontend.rocks',
  description:
    'Cookie-free, privacy-respecting analytics on frontend.rocks using GoatCounter.',
  alternates: {
    canonical: 'https://frontend.rocks/privacy/',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <article style={{ maxWidth: '680px', padding: '2rem 0 3rem' }}>
      <h1 style={{ margin: '0 0 1rem', fontSize: 'clamp(1.65rem, 3vw, 2.2rem)' }}>
        Privacy
      </h1>
      <p style={{ lineHeight: 1.65, color: 'var(--text)' }}>
        frontend.rocks counts page views, unique visitors and a few anonymous interactions (for
        example &ldquo;a lab was used&rdquo;) with{' '}
        <a
          href="https://www.goatcounter.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          GoatCounter
        </a>
        . No cookies, no IP address stored, nothing you type is sent.
      </p>
      <p style={{ lineHeight: 1.65, color: 'var(--text-muted)', marginTop: '1rem' }}>
        Embedded labs hosted on third-party pages load no analytics script. Local progress
        (such as concepts marked as understood) is stored only in your browser&apos;s{' '}
        <code>localStorage</code> and never leaves your device.
      </p>
    </article>
  );
}
