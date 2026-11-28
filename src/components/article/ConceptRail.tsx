import React from 'react';
import { DomainLabel, MetaBlock, Toc, type MetaBlockRow, type TocItem } from '@/components/ui';
import { ProofChip } from '@/components/proof/ProofChip';
import { Support } from '@/components/proof/Support';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import type { Domain } from '@/lib/schemas';
import { ProofModeToggle } from './ProofModeToggle';

export interface ConceptRailProps {
  pageId: string;
  domain: Domain;
  readingMinutes: number;
  webFeatureId: string | null;
  proof: PageProofSummary | null;
  toc: TocItem[];
}

function formatIsoDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function ConceptRail({
  pageId,
  domain,
  readingMinutes,
  webFeatureId,
  proof,
  toc,
}: ConceptRailProps) {
  const showProof = proof !== null && proof.effectiveStatus !== 'unverified';
  const lastRun = showProof ? formatIsoDate(proof.lastCheckedAt) : null;

  const rows: MetaBlockRow[] = [
    {
      key: 'DOMAIN',
      value: <DomainLabel domain={domain} href={`/concepts/?domain=${domain}`} />,
    },
    {
      key: 'READ',
      value: `${readingMinutes} min`,
    },
  ];

  if (webFeatureId) {
    rows.push({
      key: 'BASELINE',
      value: <Support pageId={pageId} webFeature={webFeatureId} variant="badge" />,
    });
  }

  if (showProof) {
    rows.push({
      key: 'PROOF',
      value: <ProofChip summary={proof} />,
    });
  }

  if (lastRun) {
    rows.push({
      key: 'LAST RUN',
      value: lastRun,
    });
  }

  return (
    <>
      <MetaBlock rows={rows} />
      {showProof ? <ProofModeToggle /> : null}
      <Toc items={toc} />
    </>
  );
}
