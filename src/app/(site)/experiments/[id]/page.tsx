import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Experiment } from '@/components/experiments/Experiment';
import { loadExperimentBundle, loadExperimentIndex } from '@/lib/proof/experiment-bundles';
import { AtelierRunAll } from './atelier-run-all';

export async function generateStaticParams() {
  return loadExperimentIndex().map((entry) => ({ id: entry.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const bundle = loadExperimentBundle(id);
    return {
      title: `${bundle.title} | Experiment | frontend.rocks`,
      robots: {
        index: false,
        follow: false,
      },
    };
  } catch {
    return {
      title: 'Experiment | frontend.rocks',
      robots: {
        index: false,
        follow: false,
      },
    };
  }
}

export default async function ExperimentAtelierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let loaded;
  try {
    loaded = loadExperimentBundle(id);
  } catch {
    notFound();
  }

  const { view: _view, ...bundle } = loaded;
  void _view;

  return (
    <main className="container" style={{ maxWidth: '1040px', margin: '0 auto', padding: '2rem 1rem' }}>
      <Experiment id={id} layout="side-by-side" />
      <AtelierRunAll bundle={bundle} />
    </main>
  );
}
