import React from 'react';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import './proof.css';

const fmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function ProofDegradedBanner({ summary }: { summary: PageProofSummary }) {
  if (summary.effectiveStatus !== 'degraded' || !summary.degradedSince || !summary.unverifiedOn) {
    return null;
  }

  const failingCount = summary.byStatus.failed + summary.byStatus.diverges + summary.byStatus.stale;
  const sinceStr = fmt.format(new Date(summary.degradedSince));
  const unverifiedStr = fmt.format(new Date(summary.unverifiedOn));

  const lead =
    failingCount > 0
      ? `${failingCount} ${failingCount === 1 ? 'claim' : 'claims'} on this page ${failingCount === 1 ? 'is' : 'are'} failing since ${sinceStr}.`
      : `A claim cited by this page is failing since ${sinceStr}.`;

  return (
    <div
      className="proof-degraded-banner"
      role="status"
      data-testid="proof-degraded-banner"
    >
      {lead} If they are not proven again by {unverifiedStr}, this page will be marked unverified.
    </div>
  );
}
