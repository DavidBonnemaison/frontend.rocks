import { z } from 'zod';
import {
  ClaimIdSchema,
  ClaimProofSchema,
  ClaimStatusSchema,
  ClaimTypeSchema,
  EngineIdSchema,
} from './claim-schema';
import type { PublishedClaimEntry } from './published-claims';
import {
  CaseResultSchema,
  ClaimEngineStatusSchema,
  ClaimResultSchema,
  perEngine,
  type ProofResults,
} from './results-schema';

export const PUBLIC_EXPORT_LICENSE = 'CC-BY-4.0' as const;
export const PUBLIC_EXPORT_ATTRIBUTION = 'frontend.rocks (https://frontend.rocks/proof/)';

export const PublicResultsExportSchema = z
  .object({
    license: z.literal(PUBLIC_EXPORT_LICENSE),
    attribution: z.string().min(1),
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    runner: z
      .object({
        playwright: z.string().min(1),
        node: z.string().min(1),
      })
      .strict(),
    engines: perEngine(z.string().min(1)),
    experiments: z.record(z.string(), z.record(z.string(), perEngine(CaseResultSchema))),
    claims: z.record(ClaimIdSchema, ClaimResultSchema),
  })
  .strict();
export type PublicResultsExport = z.infer<typeof PublicResultsExportSchema>;

export const PublicClaimsExportItemSchema = z
  .object({
    id: ClaimIdSchema,
    url: z.string().url(),
    page: z.string().url(),
    type: ClaimTypeSchema,
    statement: z.string().min(1),
    scope: z
      .object({
        engines: z.array(EngineIdSchema).min(1).optional(),
      })
      .strict()
      .optional(),
    status: ClaimStatusSchema,
    engines: perEngine(ClaimEngineStatusSchema).nullable(),
    proof: ClaimProofSchema,
    checkedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PublicClaimsExportItem = z.infer<typeof PublicClaimsExportItemSchema>;

export const PublicClaimsExportSchema = z
  .object({
    license: z.literal(PUBLIC_EXPORT_LICENSE),
    attribution: z.string().min(1),
    generatedAt: z.string().datetime(),
    claims: z.array(PublicClaimsExportItemSchema),
  })
  .strict();
export type PublicClaimsExport = z.infer<typeof PublicClaimsExportSchema>;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic JSON serialization with recursively sorted object keys. */
export function stableJsonStringify(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export function buildPublicProofExports(input: {
  siteUrl: string;
  latest: ProofResults;
  publishedClaims: PublishedClaimEntry[];
}): {
  resultsExport: PublicResultsExport;
  claimsExport: PublicClaimsExport;
  publishedExperimentIds: string[];
} {
  const { siteUrl, latest } = input;
  const sortedEntries = [...input.publishedClaims].sort((a, b) =>
    a.claim.id.localeCompare(b.claim.id)
  );

  const filteredClaims: PublicResultsExport['claims'] = {};
  const experimentIds = new Set<string>();
  const claimsList: PublicClaimsExportItem[] = [];

  for (const entry of sortedEntries) {
    const { claim, pageUrl } = entry;
    const result = latest.claims[claim.id];
    if (result) {
      filteredClaims[claim.id] = result;
    }
    if (claim.proof.kind === 'experiment') {
      experimentIds.add(claim.proof.experimentId);
    }

    const [page, slug] = claim.id.split('/');
    claimsList.push({
      id: claim.id,
      url: `${siteUrl}/claims/${page}/${slug}/`,
      page: `${siteUrl}${pageUrl}`,
      type: claim.type,
      statement: claim.statement,
      ...(claim.scope ? { scope: claim.scope } : {}),
      status: result?.status ?? 'pending',
      engines: result?.engines ?? null,
      proof: claim.proof,
      checkedAt: result?.checkedAt ?? null,
    });
  }

  const publishedExperimentIds = [...experimentIds].sort();
  const filteredExperiments: PublicResultsExport['experiments'] = {};
  for (const expId of publishedExperimentIds) {
    const expData = latest.experiments[expId];
    if (expData) {
      filteredExperiments[expId] = expData;
    }
  }

  const resultsExport = PublicResultsExportSchema.parse({
    license: PUBLIC_EXPORT_LICENSE,
    attribution: PUBLIC_EXPORT_ATTRIBUTION,
    schemaVersion: 1,
    generatedAt: latest.generatedAt,
    runner: {
      playwright: latest.runner.playwright,
      node: latest.runner.node,
    },
    engines: latest.engines,
    experiments: filteredExperiments,
    claims: filteredClaims,
  });

  const claimsExport = PublicClaimsExportSchema.parse({
    license: PUBLIC_EXPORT_LICENSE,
    attribution: PUBLIC_EXPORT_ATTRIBUTION,
    generatedAt: latest.generatedAt,
    claims: claimsList,
  });

  return { resultsExport, claimsExport, publishedExperimentIds };
}
