import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://frontend.rocks'),
  title: 'frontend.rocks: Frontend Engineering Knowledge Graph',
  description:
    'Interactive repository of foundational frontend concepts, browser engine internals, and curated technical watch.',
  alternates: {
    canonical: 'https://frontend.rocks/',
  },
  openGraph: {
    siteName: 'frontend.rocks',
    type: 'website',
    title: 'frontend.rocks: Frontend Engineering Knowledge Graph',
    description:
      'Interactive repository of foundational frontend concepts, browser engine internals, and curated technical watch.',
    url: 'https://frontend.rocks/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'frontend.rocks: Frontend Engineering Knowledge Graph',
    description:
      'Interactive repository of foundational frontend concepts, browser engine internals, and curated technical watch.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
