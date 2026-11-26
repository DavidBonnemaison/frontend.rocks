import React from 'react';
import Link from 'next/link';
import type { ClaimProofRow, EngineCellStatus, PageProofSummary } from '@/lib/proof/page-proof.types';
import { ENGINE_ORDER, engineLabel } from '@/lib/proof/engine-labels';
import { UI_STRINGS } from '@/lib/ui-strings';
import { ProofPanelTracker } from './ProofPanelTracker';
import './proof.css';

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const ENGINE_GLYPH: Record<EngineCellStatus, string> = {
  pass: '✓',
  fail: '✕',
  error: '!',
  missing: '—',
  'not-run': '·',
};

function nonExperimentSummary(row: ClaimProofRow): string {
  const datePart = row.checkedAt ? ` on ${fmt.format(new Date(row.checkedAt))}` : '';
  switch (row.proofKind) {
    case 'spec-quote':
      return datePart ? `Quote checked against the spec${datePart}` : 'Spec quote not checked yet';
    case 'source-quote':
      return datePart
        ? `Source lines checked against the repository${datePart}`
        : 'Engine source quote not checked yet';
    case 'bcd':
      return datePart ? `Compat data checked against BCD${datePart}` : 'Compat data not checked yet';
    case 'derived':
      return datePart ? `Derived from linked claims${datePart}` : 'Derived claim not checked yet';
    default:
      return 'Not checked yet';
  }
}

function externalLinkLabel(proofKind: ClaimProofRow['proofKind']): string {
  switch (proofKind) {
    case 'spec-quote':
      return 'spec';
    case 'source-quote':
      return 'source';
    case 'bcd':
      return 'MDN';
    default:
      return 'source';
  }
}

export function ProofPanel({
  summary,
  actions,
}: {
  summary: PageProofSummary;
  actions?: React.ReactNode;
}) {
  const s = UI_STRINGS.PROOF;

  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      data-testid="proof-panel"
      className="proof-panel"
    >
      <div className="proof-panel-header">
        <h2 id="proof-title">{s.panelTitle}</h2>
        <Link href="/proof/">{s.methodLink}</Link>
      </div>
      <p className="proof-panel-intro">{s.panelIntro}</p>

      {actions}

      <div className="proof-table-scroll" tabIndex={0} role="region" aria-label="Proof table">
        <table className="proof-table">
          <caption className="proof-sr-only">
            Claims on this page and their verification status per engine
          </caption>
          <thead>
            <tr>
              <th scope="col">{s.colClaim}</th>
              <th scope="col">{s.colType}</th>
              {ENGINE_ORDER.map((engine) => (
                <th scope="col" key={engine}>
                  {engineLabel(engine, summary.engines[engine])}
                </th>
              ))}
              <th scope="col">{s.colProof}</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr
                key={row.claimId}
                id={`claim-${row.slug}`}
                data-testid="proof-row"
                data-status={row.status}
              >
                <td>
                  <span className="proof-claim-statement">{row.statement}</span>
                  <span className="proof-claim-status" data-status={row.status}>
                    {s.status[row.status]}
                  </span>
                </td>
                <td>{s.type[row.type]}</td>
                {row.proofKind === 'experiment' ? (
                  ENGINE_ORDER.map((engine) => {
                    const cell: EngineCellStatus = row.engines[engine] ?? 'not-run';
                    return (
                      <td
                        key={engine}
                        className="proof-engine-cell"
                        data-testid="proof-engine-cell"
                        data-engine={engine}
                        data-result={cell}
                      >
                        <span aria-hidden="true">{ENGINE_GLYPH[cell]} </span>
                        <span>{s.engineCell[cell]}</span>
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={ENGINE_ORDER.length} className="proof-non-experiment-cell">
                    {nonExperimentSummary(row)}
                  </td>
                )}
                <td>
                  <div className="proof-links">
                    <Link href={row.proofHref}>details</Link>
                    {row.externalHref && (
                      <a
                        href={row.externalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-event="spec_link_click"
                        data-analytics-event="spec_link_click"
                        data-analytics-target={summary.pageId}
                      >
                        {externalLinkLabel(row.proofKind)}
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProofPanelTracker pageId={summary.pageId} />
    </section>
  );
}
