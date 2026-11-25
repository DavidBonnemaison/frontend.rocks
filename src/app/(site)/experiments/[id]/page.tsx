import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadExperimentBundle, loadExperimentIndex } from '@/lib/proof/experiment-bundles';
import { AtelierView } from './atelier-view';

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
  let bundle;
  try {
    bundle = loadExperimentBundle(id);
  } catch {
    notFound();
  }

  return <AtelierView bundle={bundle} />;
}
