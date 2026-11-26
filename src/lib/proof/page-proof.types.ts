import type { ClaimProofKind, ClaimStatus, ClaimType, EngineId } from './claim-schema';
import type { ClaimEngineStatus } from './results-schema';

export type EngineCellStatus = ClaimEngineStatus | 'not-run';

export interface ClaimProofRow {
  claimId: string;
  slug: string;
  type: ClaimType;
  statement: string;
  status: ClaimStatus;
  engines: Partial<Record<EngineId, EngineCellStatus>>;
  proofKind: ClaimProofKind;
  proofHref: string;
  externalHref: string | null;
  checkedAt: string | null;
}

export type EffectivePageStatus = 'proven' | 'degraded' | 'unverified';

export interface PageProofSummary {
  pageId: string;
  effectiveStatus: EffectivePageStatus;
  degradedSince: string | null;
  unverifiedOn: string | null;
  total: number;
  byStatus: Record<ClaimStatus, number>;
  byType: Record<ClaimType, number>;
  engines: Partial<Record<EngineId, string>>;
  lastCheckedAt: string | null;
  rows: ClaimProofRow[];
  hasExperiments: boolean;
  experimentIds: string[];
}
