import type { ClaimsFile, PageProofStatus } from './claim-schema';
import { pageClaimIds } from './claim-status';
import { getClaimsForPage } from './claims-loader';
import type { EffectivePageStatus } from './page-proof.types';
import { getProofResults } from './results-loader';
import type { ProofResults } from './results-schema';

export const DEGRADED_GRACE_DAYS = 7;

const MS_PER_DAY = 86_400_000;

function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY
  );
}

export interface EffectiveStatusInput {
  pageId: string;
  proofStatus: PageProofStatus;
  claims: ClaimsFile | null;
  results: ProofResults | null;
  now: Date;
}

export interface EffectivePageStatusResult {
  status: EffectivePageStatus;
  degradedSince: string | null;
}

export function computeEffectivePageStatus(input: EffectiveStatusInput): EffectivePageStatusResult {
  const { pageId, proofStatus, claims, results, now } = input;
  if (proofStatus === 'unverified' || !claims || claims.claims.length === 0) {
    return { status: 'unverified', degradedSince: null };
  }

  const claimsByPage = new Map([[pageId, claims.claims]]);
  const allClaimIds = results
    ? pageClaimIds(pageId, claimsByPage, results)
    : claims.claims.map((c) => c.id).sort();

  if (allClaimIds.length === 0) {
    return { status: 'unverified', degradedSince: null };
  }

  const failingDates: string[] = [];

  for (const id of allClaimIds) {
    const result = results?.claims[id];
    if (result?.status === 'proven') {
      continue;
    }
    if (result?.failingSince) {
      failingDates.push(result.failingSince);
      continue;
    }
    return { status: 'unverified', degradedSince: null };
  }

  if (failingDates.length === 0) {
    return { status: 'proven', degradedSince: null };
  }

  const oldest = failingDates.reduce((min, cur) =>
    Date.parse(cur) < Date.parse(min) ? cur : min
  );
  const ageDays = utcDayNumber(now) - utcDayNumber(new Date(oldest));
  if (ageDays < DEGRADED_GRACE_DAYS) {
    return { status: 'degraded', degradedSince: oldest };
  }
  return { status: 'unverified', degradedSince: null };
}

export function getEffectivePageStatus(
  pageId: string,
  proofStatus: PageProofStatus,
  now: Date = new Date()
): EffectivePageStatusResult {
  return computeEffectivePageStatus({
    pageId,
    proofStatus,
    claims: getClaimsForPage(pageId),
    results: getProofResults(),
    now,
  });
}
