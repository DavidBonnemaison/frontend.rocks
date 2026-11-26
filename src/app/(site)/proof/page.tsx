import React from 'react';
import type { Metadata } from 'next';
import '@/components/proof/proof.css';
import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  type ClaimStatus,
  type ClaimType,
} from '@/lib/proof/claim-schema';
import { CLAIM_TYPE_DESCRIPTIONS } from '@/lib/proof/claim-type-descriptions';
import { ENGINE_LABELS, ENGINE_ORDER } from '@/lib/proof/engine-labels';
import { getGlobalRunHistory, type GlobalHistoryPoint } from '@/lib/proof/history-loader';
import { getEffectivePageStatus } from '@/lib/proof/page-status';
import { getAllPublishedClaimEntries, getPublishedPageRefs } from '@/lib/proof/published-claims';
import { getBuildCommit, getVerifierRepoLinks } from '@/lib/proof/repo-links';
import { getProofResults } from '@/lib/proof/results-loader';
import { SITE_URL } from '@/lib/seo-schema';
import { UI_STRINGS } from '@/lib/ui-strings';

const dateFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export const metadata: Metadata = {
  title: 'How proofs work · frontend.rocks',
  description:
    'How frontend.rocks checks claims in real browser engines, verifies quotes against specifications and engine source, and publishes open verification results.',
  alternates: {
    canonical: `${SITE_URL}/proof/`,
  },
  robots: { index: true, follow: true },
};

function GlobalHistoryChart({ points }: { points: GlobalHistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="proof-panel-intro">
        Not enough nightly runs recorded yet to draw a 90-day trend.
      </p>
    );
  }

  const width = 640;
  const height = 180;
  const padX = 28;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const maxVal = Math.max(...points.map((p) => p.proven), 1);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / (points.length - 1)) * innerW;
    const y = padY + innerH - (p.proven / maxVal) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure style={{ margin: '1rem 0 0' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Proven claims over the last ${points.length} runs, from ${first.proven} to ${last.proven}`}
        style={{ width: '100%', maxWidth: `${width}px`, height: 'auto', display: 'block' }}
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          rx="8"
          fill="var(--surface-2)"
          stroke="var(--border)"
        />
        <polyline
          fill="none"
          stroke="var(--ok)"
          strokeWidth="2.5"
          points={coords.join(' ')}
        />
        <text x={padX} y={height - 6} fill="var(--text-muted)" fontSize="11">
          {dateFmt.format(new Date(first.at))} ({first.proven})
        </text>
        <text
          x={width - padX}
          y={height - 6}
          textAnchor="end"
          fill="var(--text-muted)"
          fontSize="11"
        >
          {dateFmt.format(new Date(last.at))} ({last.proven})
        </text>
      </svg>
    </figure>
  );
}

export default function ProofMethodPage() {
  const latest = getProofResults();
  const publishedPages = getPublishedPageRefs();
  const publishedClaims = getAllPublishedClaimEntries();
  const commit = getBuildCommit();
  const repoLinks = getVerifierRepoLinks(commit);
  const historyPoints = getGlobalRunHistory(90);

  const byStatus: Record<ClaimStatus, number> = {
    pending: 0,
    proven: 0,
    diverges: 0,
    failed: 0,
    stale: 0,
  };
  const byType: Record<ClaimType, number> = {
    observable: 0,
    normative: 0,
    implementation: 0,
    support: 0,
    measured: 0,
    derived: 0,
  };
  const experimentIds = new Set<string>();

  for (const entry of publishedClaims) {
    const status = latest.claims[entry.claim.id]?.status ?? 'pending';
    byStatus[status] += 1;
    byType[entry.claim.type] += 1;
    if (entry.claim.proof.kind === 'experiment') {
      experimentIds.add(entry.claim.proof.experimentId);
    }
  }

  const degradedPagesCount = publishedPages.filter(
    (p) => getEffectivePageStatus(p.id, p.proofStatus).status === 'degraded'
  ).length;

  const hasRunTimestamp = latest.generatedAt !== '1970-01-01T00:00:00.000Z';

  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'frontend.rocks browser behaviour claims',
    description:
      'Machine-checked claims about web platform behaviour, with per-engine results from Chromium, Firefox and WebKit.',
    url: `${SITE_URL}/proof/`,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: {
      '@type': 'Organization',
      name: 'frontend.rocks',
      url: SITE_URL,
    },
    dateModified: latest.generatedAt,
    isAccessibleForFree: true,
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}/data/results.json`,
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}/data/claims.json`,
      },
    ],
    variableMeasured: ['claim status', 'engine result'],
  };

  return (
    <article className="concept-article" style={{ maxWidth: '920px', margin: '0 auto' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />

      <h1 className="concept-title">How proofs work</h1>

      <section aria-labelledby="what-proven-means" className="proof-panel">
        <h2 id="what-proven-means">What &ldquo;proven&rdquo; means</h2>
        <p>
          Every factual sentence on a published frontend.rocks page is linked to a structured claim.
          Nothing is published because an author remembered how it worked last year: a claim only
          reaches the <strong>proven</strong> state when an automated check confirms it against a
          browser engine, a primary specification, a pinned source commit, or compatibility data.
        </p>
        <p>
          When a claim relies on an experiment, the runner executes both the treatment and a
          control variant in real browser engines and verifies that removing the mechanism under
          test changes the observed output. Claims can declare a narrower engine scope when a
          behavior is intentionally engine-specific, and that scope is displayed directly on the
          receipt.
        </p>
        <p>
          Checks run nightly. If a previously proven claim starts failing, diverging across
          engines, or going stale because its upstream source changed, the regression stays visible
          on the page receipt for 7 days. If it is not proven again within those 7 days, the page
          is automatically downgraded to <strong>unverified</strong> and removed from public
          indexes and exports until fixed.
        </p>
      </section>

      <section aria-labelledby="claim-types-heading" className="proof-panel">
        <h2 id="claim-types-heading">The six claim types</h2>
        <div className="proof-table-scroll" tabIndex={0} role="region" aria-label="Claim types">
          <table className="proof-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">What it states</th>
                <th scope="col">How it is checked</th>
              </tr>
            </thead>
            <tbody>
              {CLAIM_TYPES.map((type) => {
                const info = CLAIM_TYPE_DESCRIPTIONS[type];
                return (
                  <tr key={type}>
                    <td>
                      <strong>{info.label}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{type}</div>
                    </td>
                    <td>{info.description}</td>
                    <td>{info.verification}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="engines-heading" className="proof-panel">
        <h2 id="engines-heading">Engines and versions</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Playwright</dt>
            <dd style={{ margin: '0.2rem 0 0', fontFamily: 'var(--mono)' }}>
              {latest.runner.playwright}
            </dd>
          </div>
          {ENGINE_ORDER.map((engine) => (
            <div key={engine}>
              <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                {ENGINE_LABELS[engine]}
              </dt>
              <dd style={{ margin: '0.2rem 0 0', fontFamily: 'var(--mono)' }}>
                {latest.engines[engine] ?? 'not recorded yet'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="proof-panel-intro" style={{ marginTop: '1rem', marginBottom: 0 }}>
          WebKit here is the WebKit build shipped with Playwright. It is not Safari. Safari support
          shown on concept pages comes from MDN browser-compat-data.
        </p>
      </section>

      <section aria-labelledby="live-numbers-heading" className="proof-panel" data-testid="proof-stats">
        <h2 id="live-numbers-heading">Live numbers</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Published claims</dt>
            <dd data-stat="total-claims" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {publishedClaims.length}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Experiments</dt>
            <dd data-stat="experiments" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {experimentIds.size}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Published pages</dt>
            <dd data-stat="published-pages" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {publishedPages.length}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Degraded pages</dt>
            <dd data-stat="degraded-pages" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {degradedPagesCount}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Engines disagree</dt>
            <dd data-stat="diverges" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {byStatus.diverges}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Last run</dt>
            <dd style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontFamily: 'var(--mono)' }}>
              {hasRunTimestamp ? dateFmt.format(new Date(latest.generatedAt)) : 'Not run yet'}
            </dd>
          </div>
        </dl>

        <h3>By status</h3>
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
          {CLAIM_STATUSES.map((status) => (
            <li key={status} data-stat-status={status}>
              {UI_STRINGS.PROOF.status[status]}: <strong>{byStatus[status]}</strong>
            </li>
          ))}
        </ul>

        <h3>By type</h3>
        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
          {CLAIM_TYPES.map((type) => (
            <li key={type} data-stat-type={type}>
              {UI_STRINGS.PROOF.type[type]}: <strong>{byType[type]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="history-heading" className="proof-panel">
        <h2 id="history-heading">Global history</h2>
        <GlobalHistoryChart points={historyPoints} />
      </section>

      <section aria-labelledby="verifier-code-heading" className="proof-panel">
        <h2 id="verifier-code-heading">The code that checks</h2>
        <p className="proof-panel-intro">
          Every verifier runs in the public repository at commit <code>{commit.slice(0, 7)}</code>.
        </p>
        <ul>
          {repoLinks.map((link) => (
            <li key={`${link.kind}-${link.repoPath}`}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>{' '}
              <code>{link.repoPath}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="content-origin-heading" className="proof-panel">
        <h2 id="content-origin-heading">Where content comes from</h2>
        <p style={{ marginBottom: 0 }}>
          Content is produced elsewhere and arrives here through pull requests that must pass the
          same public checks as any contribution.
        </p>
      </section>

      <section aria-labelledby="open-data-heading" className="proof-panel">
        <h2 id="open-data-heading">Open data</h2>
        <p>
          All published claims and machine results are exported as JSON under the{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0
          </a>{' '}
          license:
        </p>
        <ul>
          <li>
            <a href="/data/results.json">/data/results.json</a> — per-engine experiment observations
            and claim results for published pages.
          </li>
          <li>
            <a href="/data/claims.json">/data/claims.json</a> — structured claim definitions,
            permalinks, and current status.
          </li>
        </ul>
        <p className="proof-panel-intro" style={{ marginBottom: 0 }}>
          Note on third-party excerpts: the CC BY 4.0 license covers frontend.rocks claim data and
          observations. Quoted passages from specifications and browser engine source files remain
          subject to their upstream licenses (WHATWG CC BY 4.0, W3C Document License, and the
          respective open-source engine licenses).
        </p>
      </section>

      <section aria-labelledby="limits-heading" className="proof-panel">
        <h2 id="limits-heading">Known limits</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>
            No real Safari: WebKit results come from Playwright&apos;s Linux WebKit build, not
            macOS or iOS Safari.
          </li>
          <li>
            No mobile hardware: experiments run on Linux desktop CI runners, not physical mobile
            devices.
          </li>
          <li>
            No absolute timing claims: measured experiments assert relative ratios between two
            variants on the same runner, never absolute millisecond numbers.
          </li>
        </ul>
      </section>
    </article>
  );
}
