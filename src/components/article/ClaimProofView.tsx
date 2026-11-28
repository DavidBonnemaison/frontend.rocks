import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Breadcrumb, CodeBlock, DataTable } from '@/components/ui';
import type { Claim, ClaimStatus, EngineId } from '@/lib/proof/claim-schema';
import { ENGINE_LABELS, ENGINE_ORDER } from '@/lib/proof/engine-labels';
import { UI_STRINGS } from '@/lib/ui-strings';
import './ArticleBlocks.css';

export interface ClaimEngineObservationRow {
  engine: EngineId;
  version: string;
  status: string;
  treatment: string;
  control: string;
}

export interface ClaimDerivedParentRow {
  claimId: string;
  href: string;
  status: ClaimStatus;
}

export interface ClaimHistoryStripRow {
  engine: string;
  cells: Array<{ date: string; outcome: 'pass' | 'fail' | 'missing' }>;
}

export interface ClaimProofViewProps {
  parentTitle: string;
  parentHref: string;
  slug: string;
  claim: Claim;
  status: ClaimStatus;
  checkedAt: string | null;
  externalHref: string | null;
  specLabel?: string | null;
  experimentSlot?: React.ReactNode;
  experimentRows?: ClaimEngineObservationRow[];
  bcdSlot?: React.ReactNode;
  derivedParents?: ClaimDerivedParentRow[];
  usedOn: Array<{ pageId: string; title: string; href: string }>;
  historyRows?: ClaimHistoryStripRow[];
}

function formatIsoDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function ClaimProofView({
  parentTitle,
  parentHref,
  slug,
  claim,
  status,
  checkedAt,
  externalHref,
  specLabel,
  experimentSlot,
  experimentRows = [],
  bcdSlot,
  derivedParents = [],
  usedOn,
  historyRows = [],
}: ClaimProofViewProps) {
  const checkedDate = formatIsoDate(checkedAt);

  const sourceCodeBlock =
    claim.proof.kind === 'source-quote'
      ? await CodeBlock({ code: claim.proof.quote, lang: 'text' })
      : null;

  return (
    <div className="claim-view flow" data-claim-kind={claim.proof.kind}>
      <header className="claim-header">
        <Breadcrumb
          items={[
            { label: parentTitle, href: parentHref },
            { label: 'Claims' },
            { label: slug },
          ]}
        />
        <h1 className="claim-statement">{claim.statement}</h1>
        <div className="claim-meta-line meta">
          <span className="caps">{UI_STRINGS.PROOF.type[claim.type]}</span>
          <span aria-hidden="true">·</span>
          <span className="claim-status-text caps" data-status={status}>
            {status.toUpperCase()}
          </span>
          {checkedDate && (
            <>
              <span aria-hidden="true">·</span>
              <span>Last checked {checkedDate}</span>
            </>
          )}
        </div>
      </header>

      <section className="claim-section" aria-labelledby={`proof-heading-${slug}`}>
        <h2 id={`proof-heading-${slug}`} className="claim-section-kicker caps">
          PROOF
        </h2>

        {claim.proof.kind === 'experiment' && (
          <>
            {experimentSlot}
            {experimentRows.length > 0 && (
              <DataTable
                caption="Observed in each engine"
                columns={[
                  { key: 'engine', label: 'Engine' },
                  { key: 'version', label: 'Version', mono: true },
                  { key: 'status', label: 'Status', mono: true },
                  { key: 'treatment', label: 'Treatment', mono: true },
                  { key: 'control', label: 'Control', mono: true },
                ]}
                rows={experimentRows.map((r) => ({
                  engine: ENGINE_LABELS[r.engine],
                  version: r.version,
                  status: r.status.toUpperCase(),
                  treatment: r.treatment,
                  control: r.control,
                }))}
              />
            )}
          </>
        )}

        {claim.proof.kind === 'spec-quote' && (
          <>
            <blockquote className="claim-spec-quote" cite={externalHref ?? claim.proof.url}>
              {claim.proof.quote}
            </blockquote>
            <p className="meta">
              {externalHref ? (
                <a
                  href={externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="u-inline-row"
                  data-event="spec_link_click"
                >
                  <span>{specLabel ?? `${claim.proof.url} #${claim.proof.anchor}`}</span>
                  <ArrowUpRight size={14} className="u-shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span>{specLabel ?? `${claim.proof.url} #${claim.proof.anchor}`}</span>
              )}
            </p>
          </>
        )}

        {claim.proof.kind === 'source-quote' && (
          <>
            <p className="meta">
              <span>
                {claim.proof.repo} @ {claim.proof.commit.slice(0, 7)} · {claim.proof.path} · L
                {claim.proof.lines[0]}–L{claim.proof.lines[1]}
              </span>
              {externalHref && (
                <>
                  {' · '}
                  <a
                    href={externalHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="u-inline-row"
                  >
                    <span>GitHub</span>
                    <ArrowUpRight size={14} className="u-shrink-0" aria-hidden="true" />
                  </a>
                </>
              )}
            </p>
            {sourceCodeBlock}
          </>
        )}

        {claim.proof.kind === 'bcd' && bcdSlot}

        {claim.proof.kind === 'derived' && (
          <>
            <h3 className="claim-section-kicker caps">FOLLOWS FROM</h3>
            <ul className="claim-derived-list ruled-list">
              {derivedParents.map((parent) => (
                <li key={parent.claimId} className="claim-derived-item meta">
                  <a href={parent.href}>{parent.claimId}</a>
                  <span className="claim-status-text caps" data-status={parent.status}>
                    {parent.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="claim-derived-reasoning">{claim.proof.reasoning}</p>
          </>
        )}
      </section>

      <section className="claim-section" aria-labelledby={`used-on-${slug}`}>
        <h2 id={`used-on-${slug}`} className="claim-section-kicker caps">
          USED ON
        </h2>
        <ul className="claim-used-list ruled-list">
          {usedOn.map((item) => (
            <li key={item.pageId} className="claim-used-item">
              <a href={`${item.href}?proof=on`}>{item.title}</a>
            </li>
          ))}
        </ul>
      </section>

      {historyRows.length > 0 && (
        <section className="claim-section" aria-labelledby={`history-${slug}`}>
          <h2 id={`history-${slug}`} className="claim-section-kicker caps">
            HISTORY (LAST 30 RUNS)
          </h2>
          <div className="claim-history-rows">
            {historyRows.map((row) => (
              <div key={row.engine} className="claim-history-row">
                <span className="claim-history-engine caps">{row.engine}</span>
                <div className="claim-history-cells" role="list" aria-label={`${row.engine} runs`}>
                  {row.cells.slice(-30).map((cell, idx) => (
                    <span
                      key={`${row.engine}-${idx}`}
                      role="listitem"
                      className="claim-history-cell"
                      data-outcome={cell.outcome}
                      title={`${cell.date}: ${cell.outcome}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="claim-history-legend meta">
            <span className="claim-history-legend-item">
              <span className="claim-history-cell" data-outcome="pass" aria-hidden="true" />
              <span>Pass</span>
            </span>
            <span className="claim-history-legend-item">
              <span className="claim-history-cell" data-outcome="fail" aria-hidden="true" />
              <span>Fail</span>
            </span>
            <span className="claim-history-legend-item">
              <span className="claim-history-cell" data-outcome="missing" aria-hidden="true" />
              <span>No data</span>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

export function buildDemoHistoryRows(): ClaimHistoryStripRow[] {
  return ENGINE_ORDER.map((engine) => ({
    engine: ENGINE_LABELS[engine],
    cells: Array.from({ length: 12 }, (_, i) => ({
      date: `2026-11-${String(14 + i).padStart(2, '0')}`,
      outcome: i === 4 && engine === 'webkit' ? 'fail' : i === 0 ? 'missing' : 'pass',
    })),
  }));
}
