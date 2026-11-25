import { z } from 'zod';
import { ClaimIdSchema, PageIdSchema } from './claim-schema';

export const ARTIFACT_KINDS = ['spec-quotes', 'source-quotes', 'support', 'coverage'] as const;
export const ArtifactKindSchema = z.enum(ARTIFACT_KINDS);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

/** Status produced by a non-experimental verifier. `pending` and `diverges` are reserved for the runner. */
export const CheckStatusSchema = z.enum(['proven', 'failed', 'stale']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const ClaimCheckResultSchema = z.object({
  claimId: ClaimIdSchema,
  status: CheckStatusSchema,
  /** Stable machine code, null when proven (e.g. "quote-not-found"). */
  reason: z.string().nullable(),
  /** Human-readable explanation. */
  message: z.string().nullable(),
  /** Verifier-specific metadata (fragment URL, section sha256, BCD versions, etc.). */
  details: z.record(z.string(), z.unknown()).default({}),
  checkedAt: z.string().datetime(),
});
export type ClaimCheckResult = z.infer<typeof ClaimCheckResultSchema>;

export const PageViolationSchema = z.object({
  rule: z.string(),
  line: z.number().int().nonnegative().nullable(),
  column: z.number().int().nonnegative().nullable(),
  message: z.string(),
  excerpt: z.string().nullable(),
});
export type PageViolation = z.infer<typeof PageViolationSchema>;

export const PageCheckResultSchema = z.object({
  pageId: PageIdSchema,
  status: z.enum(['pass', 'fail', 'skipped']),
  /** True when the page has proof_status "proven": its failures fail CI. */
  enforced: z.boolean(),
  violations: z.array(PageViolationSchema),
  stats: z.record(z.string(), z.number()).default({}),
  /** Sorted ids of claims from other pages referenced by this page; populated by coverage, empty elsewhere. */
  foreignClaimIds: z.array(ClaimIdSchema).default([]),
});
export type PageCheckResult = z.infer<typeof PageCheckResultSchema>;

export const ProofArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  kind: ArtifactKindSchema,
  generatedAt: z.string().datetime(),
  mode: z.enum(['offline', 'online']),
  /** Versions of tools and datasets used (e.g. { "cheerio": "1.2.0" }). */
  tooling: z.record(z.string(), z.string()).default({}),
  claims: z.record(ClaimIdSchema, ClaimCheckResultSchema),
  pages: z.record(PageIdSchema, PageCheckResultSchema).default({}),
});
export type ProofArtifact = z.infer<typeof ProofArtifactSchema>;
