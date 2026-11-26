import React from 'react';
import type { Metadata } from 'next';
import { InstrumentsGallery } from './InstrumentsGallery';
import './dev-instruments.css';

export const metadata: Metadata = {
  title: 'Instruments Gallery (Dev) · frontend.rocks',
  description: 'Internal visualization instruments gallery for development and visual regression.',
  robots: { index: false, follow: false },
};

export default function DevInstrumentsPage() {
  return <InstrumentsGallery />;
}
