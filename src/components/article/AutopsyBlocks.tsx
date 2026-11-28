import React from 'react';
import {
  Breadcrumb,
  MetaBlock,
  PieceBlock,
  Toc,
  type MetaBlockRow,
  type TocItem,
} from '@/components/ui';
import { ProofChip } from '@/components/proof/ProofChip';
import type { AutopsyPageView } from '@/lib/pages/view-models';
import { formatFailureModeLabel } from '@/lib/ui-strings';
import { ProofModeToggle } from './ProofModeToggle';
import './ArticleBlocks.css';

function formatIsoDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function AutopsyHeader({ view }: { view: AutopsyPageView }) {
  return (
    <div className="autopsy-hero-header is-full" data-block="header">
      <Breadcrumb
        items={[
          { label: 'Debug', href: '/autopsies/' },
          { label: 'Autopsies', href: '/autopsies/' },
          { label: `Case ${view.number}` },
        ]}
      />
      <PieceBlock
        color={view.pieceColor}
        number={view.number}
        kicker="CASE"
        title={view.title}
        dek={view.symptom}
        schematic={view.heroSnapshot}
        size="hero"
        titleAs="h1"
      />
    </div>
  );
}

export function AutopsyRail({
  view,
  toc,
}: {
  view: AutopsyPageView;
  toc: TocItem[];
}) {
  const showProof = view.proof !== null && view.proof.effectiveStatus !== 'unverified';
  const lastRun = showProof ? formatIsoDate(view.proof?.lastCheckedAt ?? null) : null;

  const rows: MetaBlockRow[] = [
    { key: 'CASE', value: view.number },
    { key: 'FAILURE MODE', value: formatFailureModeLabel(view.failureMode) },
    { key: 'READ', value: `${view.readingMinutes} min` },
  ];

  if (showProof && view.proof) {
    rows.push({ key: 'PROOF', value: <ProofChip summary={view.proof} /> });
  }
  if (lastRun) {
    rows.push({ key: 'LAST RUN', value: lastRun });
  }

  return (
    <>
      <MetaBlock rows={rows} />
      {showProof ? <ProofModeToggle /> : null}
      <Toc items={toc} />
    </>
  );
}

export function AutopsyCaseFileBlock({ view }: { view: AutopsyPageView }) {
  return (
    <section
      id="case-file"
      className="autopsy-case-file is-wide"
      data-block="case-file"
      data-testid="architectural-fix-section"
      aria-labelledby="case-file-heading"
    >
      <div className="autopsy-case-file-head" data-testid="case-file-card">
        <span className="autopsy-case-tab caps">CASE FILE</span>
        <h2 id="case-file-heading" className="autopsy-case-file-title">
          Case file
        </h2>
      </div>

      <MetaBlock rows={view.caseFile} />

      {view.badFixes.length > 0 && (
        <div className="autopsy-bad-fixes">
          <h3 className="autopsy-bad-fixes-label caps">BAD FIXES</h3>
          <ul className="autopsy-bad-fixes-list ruled-list">
            {view.badFixes.map((bf, idx) => (
              <li key={idx} className="autopsy-bad-fix-item">
                <span className="autopsy-bad-fix-label meta">{bf.label}</span>
                <p className="autopsy-bad-fix-outcome">{bf.outcome}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function AutopsyCausalChain({
  steps,
}: {
  steps: AutopsyPageView['causalSteps'];
}) {
  if (steps.length === 0) return null;
  return (
    <section
      id="causal-chain"
      className="autopsy-causal is-wide"
      data-block="causal-chain"
      data-testid="causal-chain-stepper"
      aria-labelledby="causal-chain-heading"
    >
      <h2 id="causal-chain-heading" className="autopsy-causal-heading">
        Causal chain
      </h2>
      <ol className="autopsy-causal-list ruled-list">
        {steps.map((step) => (
          <li key={step.conceptId} className="autopsy-causal-item">
            <span className="autopsy-causal-step caps">STEP {step.order}</span>
            <a href={`/concepts/${step.conceptId}/`} className="autopsy-causal-title causal-step-title">
              {step.conceptTitle}
            </a>
            <p className="autopsy-causal-role">{step.role}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AutopsyPrevNext({
  prev,
  next,
}: {
  prev: AutopsyPageView['prev'];
  next: AutopsyPageView['next'];
}) {
  if (!prev && !next) return null;
  return (
    <nav className="autopsy-prev-next is-wide" aria-label="Adjacent cases">
      <div className="autopsy-prev-next-slot">
        {prev && (
          <>
            <span className="autopsy-prev-next-label caps">Previous case</span>
            <PieceBlock
              color={prev.pieceColor}
              number={prev.number}
              kicker="CASE"
              title={prev.title}
              dek={prev.dek}
              size="tile"
              href={`/autopsies/${prev.id}/`}
            />
          </>
        )}
      </div>
      <div className="autopsy-prev-next-slot">
        {next && (
          <>
            <span className="autopsy-prev-next-label caps">Next case</span>
            <PieceBlock
              color={next.pieceColor}
              number={next.number}
              kicker="CASE"
              title={next.title}
              dek={next.dek}
              size="tile"
              href={`/autopsies/${next.id}/`}
            />
          </>
        )}
      </div>
    </nav>
  );
}
