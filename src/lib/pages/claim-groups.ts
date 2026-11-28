import type { ClaimStatus } from '@/lib/proof/claim-schema';
import type { ClaimProofRow } from '@/lib/proof/page-proof.types';

const ORDER: ClaimStatus[] = ['failed', 'diverges', 'stale', 'pending', 'proven'];

export function worstStatus(rows: ClaimProofRow[]): ClaimStatus {
  return ORDER.find((s) => rows.some((r) => r.status === s)) ?? 'pending';
}
