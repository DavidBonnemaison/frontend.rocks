import React from 'react';
import type { Metadata } from 'next';
import { DiagnoseWorkbench } from '@/components/diagnose/DiagnoseWorkbench';
import { SITE_URL } from '@/lib/seo-schema';

export const metadata: Metadata = {
  title: 'Client-Side Trace & HAR Diagnostic Tool | frontend.rocks',
  description:
    'Analyze Chrome DevTools Performance traces (.json) and HTTP Archive (.har) files 100% locally in a Web Worker. Zero bytes leave your browser.',
  alternates: {
    canonical: `${SITE_URL}/diagnose/`,
  },
  openGraph: {
    title: 'Client-Side Trace & HAR Diagnostic Tool | frontend.rocks',
    description:
      'Analyze Chrome DevTools Performance traces (.json) and HTTP Archive (.har) files 100% locally in a Web Worker. Zero bytes leave your browser.',
    url: `${SITE_URL}/diagnose/`,
    type: 'website',
  },
};

export default function DiagnosePage() {
  return <DiagnoseWorkbench />;
}
