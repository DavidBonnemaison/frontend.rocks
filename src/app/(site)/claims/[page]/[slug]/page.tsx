import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleLayout } from '@/components/article/ArticleLayout';
import {
  ClaimProofView,
  type ClaimEngineObservationRow,
  type ClaimHistoryStripRow,
} from '@/components/article/ClaimProofView';
import { Experiment } from '@/components/experiments/Experiment';
import { Support } from '@/components/proof/Support';
import { getAutopsyById, getConceptById } from '@/lib/content-loader';
import { getPagesCitingClaim } from '@/lib/proof/citations-index';
import { ENGINE_LABELS, ENGINE_ORDER } from '@/lib/proof/engine-labels';
import { getClaimHistory } from '@/lib/proof/history-loader';
import { getAllPublishedClaimEntries } from '@/lib/proof/published-claims';
import { getProofResults } from '@/lib/proof/results-loader';
import { externalHrefFor } from '@/lib/proof/spec-links';
import { SITE_URL } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

export const dynamicParams = false;

function truncateTitle(statement: string, max = 70): string {
  if (statement.length <= max) return statement;
  return `${statement.slice(0, max - 1).trimEnd()}…`;
}

function parentTitleFor(pageId: string, pageKind: string): string {
  if (pageKind === 'concept') return getConceptById(pageId)?.frontmatter.title ?? pageId;
  if (pageKind === 'autopsy') return getAutopsyById(pageId)?.frontmatter.title ?? pageId;
  return pageId;
}

function findPublishedClaimEntry(page: string, slug: string) {
  const id = `${page}/${slug}`;
  return getAllPublishedClaimEntries().find((e) => e.claim.id === id) ?? null;
}

export function generateStaticParams(): Array<{ page: string; slug: string }> {
  const params = getAllPublishedClaimEntries().map((entry) => {
    const [page, slug] = entry.claim.id.split('/');
    return { page, slug };
  });
  return params.length > 0 ? params : [{ page: '_', slug: '_' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string; slug: string }>;
}): Promise<Metadata> {
  const { page, slug } = await params;
  if (page === '_' && slug === '_') {
    return {
      title: 'No published claims yet · frontend.rocks',
      robots: { index: false, follow: false },
    };
  }
  const entry = findPublishedClaimEntry(page, slug);
  if (!entry) return {};
  const canonical = `${SITE_URL}/claims/${page}/${slug}/`;
  return {
    title: `${truncateTitle(entry.claim.statement)} · frontend.rocks`,
    description: entry.claim.statement,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function ClaimPermalinkPage({
  params,
}: {
  params: Promise<{ page: string; slug: string }>;
}) {
  const { page, slug } = await params;
  if (page === '_' && slug === '_') {
    return (
      <ArticleLayout
        testId="claim-permalink"
        header={
          <header className="claim-header is-header">
            <h1 className="claim-statement">No published claims yet.</h1>
          </header>
        }
      >
        <p>
          <a href="/proof/">{UI_STRINGS.PROOF.methodLink}</a>
        </p>
      </ArticleLayout>
    );
  }

  const entry = findPublishedClaimEntry(page, slug);
  if (!entry) notFound();

  const { claim, pageId, pageKind, pageUrl } = entry;
  const results = getProofResults();
  const claimResult = results.claims[claim.id] ?? null;
  const status = claimResult?.status ?? 'pending';
  const checkedAt = claimResult?.checkedAt ?? null;
  const parentTitle = parentTitleFor(pageId, pageKind);
  const externalHref = externalHrefFor(claim);
  const history = getClaimHistory(claim.id, 30);
  const citedIn = getPagesCitingClaim(claim.id);
  const canonicalUrl = `${SITE_URL}/claims/${page}/${slug}/`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: claim.statement,
    url: canonicalUrl,
    isPartOf: `${SITE_URL}${pageUrl}`,
    about: parentTitle,
    ...(checkedAt ? { dateModified: checkedAt } : {}),
  };

  const experimentRows: ClaimEngineObservationRow[] = [];
  if (claim.proof.kind === 'experiment') {
    const expResults = results.experiments[claim.proof.experimentId] ?? {};
    const firstKey = claim.proof.expectKeys[0];
    for (const engine of ENGINE_ORDER) {
      const res = firstKey ? expResults[firstKey]?.[engine] : undefined;
      const obs = res?.observed as { treatment?: unknown; control?: unknown } | undefined;
      experimentRows.push({
        engine,
        version: results.engines[engine] ?? '—',
        status: res?.status ?? 'not-run',
        treatment: obs && 'treatment' in obs ? JSON.stringify(obs.treatment) : '—',
        control: obs && 'control' in obs ? JSON.stringify(obs.control) : '—',
      });
    }
  }

  const derivedParents =
    claim.proof.kind === 'derived'
      ? claim.proof.from.map((depId) => {
          const [depPage, depSlug] = depId.split('/');
          return {
            claimId: depId,
            href: `/claims/${depPage}/${depSlug}/`,
            status: results.claims[depId]?.status ?? 'pending',
          };
        })
      : [];

  const historyRows: ClaimHistoryStripRow[] =
    history.length > 0
      ? (claim.proof.kind === 'experiment' ? ENGINE_ORDER : (['chromium'] as const)).map(
          (engine) => ({
            engine: claim.proof.kind === 'experiment' ? ENGINE_LABELS[engine] : 'Status',
            cells: history.map((h) => ({
              date: h.at.slice(0, 10),
              outcome: h.to === 'proven' ? 'pass' : h.to === 'pending' ? 'missing' : 'fail',
            })),
          })
        )
      : [];

  const usedOn =
    citedIn.length > 0
      ? citedIn
      : [{ pageId, title: parentTitle, href: pageUrl }];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleLayout
        testId="claim-permalink"
        header={null}
        afterContent={
          <p className="meta">
            <a href="/proof/">{UI_STRINGS.PROOF.methodLink}</a>
          </p>
        }
      >
        <div className="is-wide">
          <ClaimProofView
            parentTitle={parentTitle}
            parentHref={pageUrl}
            slug={slug}
            claim={claim}
            status={status}
            checkedAt={checkedAt}
            externalHref={externalHref}
            experimentSlot={
              claim.proof.kind === 'experiment' ? (
                <Experiment id={claim.proof.experimentId} />
              ) : undefined
            }
            experimentRows={experimentRows}
            bcdSlot={
              claim.proof.kind === 'bcd' ? (
                <Support feature={claim.proof.bcdKey} variant="table" />
              ) : undefined
            }
            derivedParents={derivedParents}
            usedOn={usedOn}
            historyRows={historyRows}
          />
        </div>
      </ArticleLayout>
    </>
  );
}
