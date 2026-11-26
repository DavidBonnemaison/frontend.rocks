import React from 'react';
import type { PageProofSummary } from '@/lib/proof/page-proof.types';
import { ENGINE_ORDER, engineLabel } from '@/lib/proof/engine-labels';
import { UI_STRINGS } from '@/lib/ui-strings';
import './proof.css';

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function ProofChip({ summary }: { summary: PageProofSummary }) {
  const s = UI_STRINGS.PROOF;
  const engines = ENGINE_ORDER.filter((e) => summary.engines[e]).map((e) => engineLabel(e));
  const issues = summary.byStatus.failed + summary.byStatus.diverges + summary.byStatus.stale;

  return (
    <a
      href="#proof"
      className="proof-chip"
      data-testid="proof-chip"
      data-issues={issues > 0 ? 'true' : 'false'}
    >
      <span>{s.chipClaims(summary.total)}</span>
      {engines.length > 0 && (
        <span>
          {' '}
          · {s.chipProvenIn} {engines.join(', ')}
        </span>
      )}
      {summary.lastCheckedAt && (
        <span>
          {' '}
          · {s.chipChecked} {fmt.format(new Date(summary.lastCheckedAt))}
        </span>
      )}
      {issues > 0 && (
        <span className="proof-chip-issues">
          {' '}
          · {issues} {issues === 1 ? 'issue' : 'issues'}
        </span>
      )}
    </a>
  );
}
