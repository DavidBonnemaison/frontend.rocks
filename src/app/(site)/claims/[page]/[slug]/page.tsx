import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConceptCodeBlock } from '@/components/concepts/ConceptCodeBlock';
import { RunProofsButton } from '@/components/proof/RunProofsButton';
import { Support } from '@/components/proof/Support';
import '@/components/proof/proof.css';
import { getAutopsyById, getConceptById } from '@/lib/content-loader';
import { buildBrowserProofPayloadForClaims } from '@/lib/proof/browser-proof-payload';
import { getPagesCitingClaim } from '@/lib/proof/citations-index';
import type { Claim, EngineId } from '@/lib/proof/claim-schema';
import { ENGINE_LABELS, ENGINE_ORDER, engineLabel } from '@/lib/proof/engine-labels';
import { loadExperimentBundle } from '@/lib/proof/experiment-bundles';
import { getClaimHistory } from '@/lib/proof/history-loader';
import { getAllPublishedClaimEntries } from '@/lib/proof/published-claims';
import { getProofResults } from '@/lib/proof/results-loader';
import { externalHrefFor } from '@/lib/proof/spec-links';
import { SITE_URL } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

export const dynamicParams = false;

const dateFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function truncateTitle(statement: string, max = 70): string {
  if (statement.length <= max) return statement;
  return `${statement.slice(0, max - 1).trimEnd()}…`;
}

function formatScope(engines?: EngineId[]): string {
  const list = (engines && engines.length > 0 ? engines : [...ENGINE_ORDER]).map(
    (e) => ENGINE_LABELS[e]
  );
  if (list.length === 1) return `Checked in ${list[0]}`;
  if (list.length === 2) return `Checked in ${list[0]} and ${list[1]}`;
  return `Checked in ${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
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

function renderCodeBlock(code: string, lang: string) {
  return (
    <ConceptCodeBlock>
      <code className={`language-${lang}`}>{code}</code>
    </ConceptCodeBlock>
  );
}

function ExperimentProofBlock({ claim }: { claim: Claim }) {
  if (claim.proof.kind !== 'experiment') return null;
  const results = getProofResults();
  const expResults = results.experiments[claim.proof.experimentId] ?? {};
  const payload = buildBrowserProofPayloadForClaims([claim]);

  let bundle = null;
  try {
    bundle = loadExperimentBundle(claim.proof.experimentId);
  } catch {
    bundle = null;
  }

  return (
    <section aria-labelledby="proof-evidence-title" className="proof-panel">
      <h2 id="proof-evidence-title">{bundle?.title ?? claim.proof.experimentId}</h2>
      {bundle?.question && <p className="proof-panel-intro">{bundle.question}</p>}

      {payload.items.some((item) => item.notRunnable === null) && (
        <RunProofsButton
          items={payload.items}
          bundles={payload.bundles}
          label="Run in your browser"
        />
      )}

      <div className="proof-table-scroll" tabIndex={0} role="region" aria-label="Observed results">
        <table className="proof-table">
          <thead>
            <tr>
              <th scope="col">Expect case</th>
              {ENGINE_ORDER.map((engine) => (
                <th scope="col" key={engine}>
                  {engineLabel(engine, results.engines[engine])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claim.proof.expectKeys.map((key) => (
              <tr key={key}>
                <td>
                  <code>{key}</code>
                </td>
                {ENGINE_ORDER.map((engine) => {
                  const res = expResults[key]?.[engine];
                  if (!res) {
                    return (
                      <td key={engine} className="proof-engine-cell" data-result="not-run">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={engine} className="proof-engine-cell" data-result={res.status}>
                      <div>{res.status}</div>
                      <code>{JSON.stringify(res.observed)}</code>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bundle && (
        <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
          <div>
            <h3>Fixture</h3>
            {bundle.fixture.html && renderCodeBlock(bundle.fixture.html, 'html')}
            {bundle.fixture.css && renderCodeBlock(bundle.fixture.css, 'css')}
            {bundle.fixture.js && renderCodeBlock(bundle.fixture.js, 'js')}
          </div>
          <div>
            <h3>Treatment ({bundle.variants.treatment.label})</h3>
            {bundle.variants.treatment.html &&
              renderCodeBlock(bundle.variants.treatment.html, 'html')}
            {bundle.variants.treatment.css && renderCodeBlock(bundle.variants.treatment.css, 'css')}
            {bundle.variants.treatment.js && renderCodeBlock(bundle.variants.treatment.js, 'js')}
          </div>
          <div>
            <h3>Control ({bundle.variants.control.label})</h3>
            {bundle.variants.control.html && renderCodeBlock(bundle.variants.control.html, 'html')}
            {bundle.variants.control.css && renderCodeBlock(bundle.variants.control.css, 'css')}
            {bundle.variants.control.js && renderCodeBlock(bundle.variants.control.js, 'js')}
          </div>
        </div>
      )}
    </section>
  );
}

export default async function ClaimPermalinkPage({
  params,
}: {
  params: Promise<{ page: string; slug: string }>;
}) {
  const { page, slug } = await params;
  if (page === '_' && slug === '_') {
    return (
      <article className="concept-article" data-testid="claim-permalink">
        <h1>No published claims yet.</h1>
        <p>
          <Link href="/proof/">{UI_STRINGS.PROOF.methodLink}</Link>
        </p>
      </article>
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
  const history = getClaimHistory(claim.id, 20);
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

  return (
    <article className="concept-article" data-testid="claim-permalink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
        <Link href={pageUrl}>{parentTitle}</Link>
        <span aria-hidden="true"> / </span>
        <span>Claim</span>
      </nav>

      <h1 className="concept-title">{claim.statement}</h1>

      <div className="concept-meta" style={{ marginBottom: '1.5rem' }}>
        <span className="badge">{UI_STRINGS.PROOF.type[claim.type]}</span>
        <span className="badge">{formatScope(claim.scope?.engines)}</span>
        <span className="proof-claim-status" data-status={status}>
          {UI_STRINGS.PROOF.status[status]}
        </span>
      </div>

      {claim.proof.kind === 'experiment' && <ExperimentProofBlock claim={claim} />}

      {claim.proof.kind === 'spec-quote' && (
        <section aria-labelledby="proof-evidence-title" className="proof-panel">
          <h2 id="proof-evidence-title">Specification quote</h2>
          <blockquote cite={externalHref ?? claim.proof.url}>{claim.proof.quote}</blockquote>
          <p className="proof-panel-intro">
            {externalHref && (
              <a href={externalHref} target="_blank" rel="noopener noreferrer">
                Open specification passage
              </a>
            )}
            {checkedAt && <span> · Checked {dateFmt.format(new Date(checkedAt))}</span>}
          </p>
        </section>
      )}

      {claim.proof.kind === 'source-quote' && (
        <section aria-labelledby="proof-evidence-title" className="proof-panel">
          <h2 id="proof-evidence-title">Engine source excerpt</h2>
          <p className="proof-panel-intro">
            {claim.proof.repo} @ {claim.proof.commit.slice(0, 7)} · {claim.proof.path} · L
            {claim.proof.lines[0]}–L{claim.proof.lines[1]}
          </p>
          {renderCodeBlock(claim.proof.quote, 'text')}
          {externalHref && (
            <p>
              <a href={externalHref} target="_blank" rel="noopener noreferrer">
                View lines on GitHub
              </a>
            </p>
          )}
        </section>
      )}

      {claim.proof.kind === 'bcd' && (
        <section aria-labelledby="proof-evidence-title" className="proof-panel">
          <h2 id="proof-evidence-title">Browser compatibility data</h2>
          <Support feature={claim.proof.bcdKey} variant="table" />
        </section>
      )}

      {claim.proof.kind === 'derived' && (
        <section aria-labelledby="proof-evidence-title" className="proof-panel">
          <h2 id="proof-evidence-title">Derived from</h2>
          <ul>
            {claim.proof.from.map((depId) => {
              const [depPage, depSlug] = depId.split('/');
              const depStatus = results.claims[depId]?.status ?? 'pending';
              return (
                <li key={depId}>
                  <Link href={`/claims/${depPage}/${depSlug}/`}>{depId}</Link>{' '}
                  <span>({UI_STRINGS.PROOF.status[depStatus]})</span>
                </li>
              );
            })}
          </ul>
          <p>{claim.proof.reasoning}</p>
        </section>
      )}

      <section aria-labelledby="claim-history-title" className="proof-panel">
        <h2 id="claim-history-title">History</h2>
        {history.length === 0 ? (
          <p className="proof-panel-intro">History starts with the next nightly run.</p>
        ) : (
          <ul>
            {history.map((item, idx) => (
              <li key={`${item.at}-${idx}`}>
                <time dateTime={item.at}>{dateFmt.format(new Date(item.at))}</time>:{' '}
                {item.from ? `${UI_STRINGS.PROOF.status[item.from]} → ` : ''}
                {UI_STRINGS.PROOF.status[item.to]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="claim-cited-in-title" className="proof-panel">
        <h2 id="claim-cited-in-title">Cited in</h2>
        {citedIn.length === 0 ? (
          <p className="proof-panel-intro">
            <Link href={pageUrl}>{parentTitle}</Link>
          </p>
        ) : (
          <ul>
            {citedIn.map((p) => (
              <li key={p.pageId}>
                <Link href={p.href}>{p.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/proof/">{UI_STRINGS.PROOF.methodLink}</Link>
      </p>
    </article>
  );
}
