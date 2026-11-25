import type { SpecQuoteClaim } from './record';
import type { SpecVerifyOutcome } from './verify';

export interface SpecDriftEntry {
  claimId: string;
  kind: 'stale' | 'section-changed' | 'unavailable';
  /** Machine reason code (e.g. 'quote-not-found', 'anchor-not-found'); null for section-changed and unavailable. */
  reason: string | null;
  url: string;
  anchor: string;
}

export function buildSpecDriftReport(
  outcomes: Array<{ claim: SpecQuoteClaim; outcome: SpecVerifyOutcome }>
): SpecDriftEntry[] {
  const entries: SpecDriftEntry[] = [];
  for (const { claim, outcome } of outcomes) {
    if (outcome.kind === 'unavailable') {
      entries.push({
        claimId: claim.id,
        kind: 'unavailable',
        reason: null,
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      });
      continue;
    }

    if (outcome.result.status === 'stale') {
      entries.push({
        claimId: claim.id,
        kind: 'stale',
        reason: outcome.result.reason,
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      });
      continue;
    }

    if (outcome.result.status === 'proven' && outcome.result.details.sectionChanged === true) {
      entries.push({
        claimId: claim.id,
        kind: 'section-changed',
        reason: null,
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      });
    }
  }
  return entries;
}
