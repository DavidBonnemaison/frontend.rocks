import type { ClaimStatus, ClaimType, PageProofStatus } from './claim-schema';
import { getClaimsForPage } from './claims-loader';
import { ENGINE_ORDER } from './engine-labels';
import type { ClaimProofRow, PageProofSummary } from './page-proof.types';
import { DEGRADED_GRACE_DAYS, getEffectivePageStatus } from './page-status';
import { getProofResults } from './results-loader';
import { externalHrefFor } from './spec-links';

export type {
  ClaimProofRow,
  EffectivePageStatus,
  EngineCellStatus,
  PageProofSummary,
} from './page-proof.types';

const EMPTY_STATUS: Record<ClaimStatus, number> = {
  pending: 0,
  proven: 0,
  diverges: 0,
  failed: 0,
  stale: 0,
};

const EMPTY_TYPE: Record<ClaimType, number> = {
  observable: 0,
  normative: 0,
  implementation: 0,
  support: 0,
  measured: 0,
  derived: 0,
};

const MS_PER_DAY = 86_400_000;

export function summarizePageProof(
  pageId: string,
  proofStatus: PageProofStatus,
  now: Date = new Date()
): PageProofSummary | null {
  const file = getClaimsForPage(pageId);
  if (!file) return null;

  const results = getProofResults();
  const effective = getEffectivePageStatus(pageId, proofStatus, now);

  const rows: ClaimProofRow[] = file.claims.map((claim) => {
    const r = results.claims[claim.id] ?? null;
    const status: ClaimStatus = r?.status ?? 'pending';
    const engines: ClaimProofRow['engines'] = {};
    if (claim.proof.kind === 'experiment') {
      const scope = claim.scope?.engines ?? ENGINE_ORDER;
      for (const e of ENGINE_ORDER) {
        engines[e] = !scope.includes(e) ? 'not-run' : (r?.engines?.[e] ?? 'missing');
      }
    }
    const slug = claim.id.split('/')[1];
    return {
      claimId: claim.id,
      slug,
      type: claim.type,
      statement: claim.statement,
      status,
      engines,
      proofKind: claim.proof.kind,
      proofHref: `/claims/${pageId}/${slug}/`,
      externalHref: externalHrefFor(claim),
      checkedAt: r?.checkedAt ?? null,
    };
  });

  const byStatus: Record<ClaimStatus, number> = { ...EMPTY_STATUS };
  const byType: Record<ClaimType, number> = { ...EMPTY_TYPE };
  for (const row of rows) {
    byStatus[row.status] += 1;
    byType[row.type] += 1;
  }

  const experimentIds = [
    ...new Set(
      file.claims
        .filter((c) => c.proof.kind === 'experiment')
        .map((c) => (c.proof as { experimentId: string }).experimentId)
    ),
  ];

  const checked = rows
    .map((r) => r.checkedAt)
    .filter((d): d is string => d !== null)
    .sort();

  const unverifiedOn = effective.degradedSince
    ? new Date(Date.parse(effective.degradedSince) + DEGRADED_GRACE_DAYS * MS_PER_DAY).toISOString()
    : null;

  return {
    pageId,
    effectiveStatus: effective.status,
    degradedSince: effective.degradedSince,
    unverifiedOn,
    total: rows.length,
    byStatus,
    byType,
    engines: results.engines ?? {},
    lastCheckedAt: checked.at(-1) ?? null,
    rows,
    hasExperiments: experimentIds.length > 0,
    experimentIds,
  };
}
