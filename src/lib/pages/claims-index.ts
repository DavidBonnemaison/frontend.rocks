import type { Claim } from '@/lib/proof/claim-schema';
import { getAllClaims } from '@/lib/proof/claims-loader';

let cachedClaimsById: Map<string, Claim> | null = null;

export function getClaimsByIdMap(): Map<string, Claim> {
  if (!cachedClaimsById) {
    cachedClaimsById = new Map(getAllClaims().map((c) => [c.id, c]));
  }
  return cachedClaimsById;
}
