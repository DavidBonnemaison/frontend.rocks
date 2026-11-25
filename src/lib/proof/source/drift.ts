import type { SourceQuoteClaim } from './record';
import type { SourceVerifyOutcome } from './verify';

export interface SourceDriftEntry {
  claimId: string;
  kind: 'stale' | 'moved' | 'unavailable';
  headCommit: string | null;
  linesAtHead: [number, number] | null;
}

export function buildSourceDriftReport(
  outcomes: Array<{ claim: SourceQuoteClaim; outcome: SourceVerifyOutcome }>
): SourceDriftEntry[] {
  const entries: SourceDriftEntry[] = [];
  for (const { claim, outcome } of outcomes) {
    if (outcome.kind === 'unavailable') {
      entries.push({
        claimId: claim.id,
        kind: 'unavailable',
        headCommit: null,
        linesAtHead: null,
      });
      continue;
    }

    if (outcome.result.status === 'stale') {
      entries.push({
        claimId: claim.id,
        kind: 'stale',
        headCommit: outcome.head?.headCommit ?? null,
        linesAtHead: null,
      });
      continue;
    }

    if (outcome.result.status === 'proven' && outcome.result.details.moved === true) {
      entries.push({
        claimId: claim.id,
        kind: 'moved',
        headCommit: outcome.head?.headCommit ?? null,
        linesAtHead: outcome.head?.linesAtHead ?? null,
      });
    }
  }
  return entries;
}
