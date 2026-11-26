import React from 'react';
import type { Metadata } from 'next';
import '@/styles/layers.css';
import '@/styles/reset.css';
import '@/styles/tokens.css';
import '@/styles/scales.css';
import '@/styles/legacy-aliases.css';
import '@/styles/base.css';
import '@/styles/layout.css';
import '@/styles/utilities.css';
import './globals.css';
import { fontMeta, fontReadout, fontText } from './fonts';
import { THEME_BOOT_SCRIPT } from '@/components/ui/ThemeToggle/theme-boot';
import { SRGB } from '@/lib/design/tokens.generated';

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
    <html
      lang="en"
      data-theme="light"
      className={`${fontText.variable} ${fontMeta.variable} ${fontReadout.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <meta name="theme-color" content={SRGB.light.paper} />
      </head>
      <body>{children}</body>
    </html>
  );
}
