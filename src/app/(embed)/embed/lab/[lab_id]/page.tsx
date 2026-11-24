import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAllAutopsies,
  getAllConcepts,
  getAllLabs,
  getLabById,
} from '@/lib/content-loader';
import { InteractiveLabRenderer } from '@/components/labs/InteractiveLabRenderer';
import { SITE_URL } from '@/lib/seo-schema';

function resolveLabParent(labId: string): { href: string; label: string } {
  const concepts = getAllConcepts();
  const concept = concepts.find((c) => (c.frontmatter.lab_id ?? c.frontmatter.id) === labId);
  if (concept) {
    return {
      href: `/concepts/${concept.frontmatter.id}/#lab`,
      label: concept.frontmatter.title,
    };
  }

  const autopsies = getAllAutopsies();
  const autopsy = autopsies.find((a) => (a.frontmatter.lab_id ?? a.frontmatter.id) === labId);
  if (autopsy) {
    return {
      href: `/autopsies/${autopsy.frontmatter.id}/#lab`,
      label: autopsy.frontmatter.title,
    };
  }

  return {
    href: '/',
    label: 'frontend.rocks',
  };
}

export async function generateStaticParams() {
  return getAllLabs().map((lab) => ({ lab_id: lab.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lab_id: string }>;
}): Promise<Metadata> {
  const { lab_id } = await params;
  const lab = getLabById(lab_id);
  if (!lab) return {};

  const parent = resolveLabParent(lab_id);
  return {
    title: `${lab.title} — Interactive Lab | frontend.rocks`,
    description: lab.description ?? `Interactive browser-internals model for ${parent.label}.`,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: `${SITE_URL}${parent.href.replace(/#lab$/, '')}`,
    },
  };
}

export default async function EmbedLabPage({
  params,
}: {
  params: Promise<{ lab_id: string }>;
}) {
  const { lab_id } = await params;
  const lab = getLabById(lab_id);
  if (!lab) notFound();

  const parent = resolveLabParent(lab_id);

  return (
    <div className="embed-lab-shell">
      <div className="embed-lab-main">
        <InteractiveLabRenderer config={lab} showEmbedButton={false} />
      </div>
      <div className="embed-attribution-bar" data-testid="embed-attribution-bar">
        <span>Interactive model by frontend.rocks — </span>
        <a
          href={`${SITE_URL}${parent.href}`}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-attribution-link"
        >
          Open full dissection ↗
        </a>
      </div>
    </div>
  );
}
