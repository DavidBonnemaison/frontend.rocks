import { z } from 'zod';
import { ClaimIdSchema, ExperimentIdSchema, PageIdSchema } from '../proof/claim-schema';

export const VsPairSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+-vs-[a-z0-9-]+$/),
  /** Approach of the treatment variant. */
  primary: PageIdSchema,
  /** Approach of the control variant. */
  secondary: PageIdSchema,
  question: z.string().min(20).max(160),
  experimentId: ExperimentIdSchema,
  /** Claims of content/claims/vs-<slug>.claims.json. */
  claim_ids: z.array(ClaimIdSchema).min(2),
  proof_status: z.enum(['unverified', 'proven']),
});
export type VsPairEntry = z.infer<typeof VsPairSchema>;

export const VsPairsFileSchema = z.object({ pairs: z.array(VsPairSchema) });
export type VsPairsFile = z.infer<typeof VsPairsFileSchema>;

/** Canonical on-disk format of pairs.json (sorted by slug, 2-space JSON, trailing newline). */
export function serializeVsPairsFile(file: VsPairsFile): string {
  const sorted = { ...file, pairs: [...file.pairs].sort((a, b) => a.slug.localeCompare(b.slug)) };
  return JSON.stringify(sorted, null, 2) + '\n';
}

/** True when `raw` is exactly `JSON.stringify(JSON.parse(raw), null, 2) + '\n'`. */
export function isCanonicalVsPairsFile(raw: string): boolean {
  return JSON.stringify(JSON.parse(raw), null, 2) + '\n' === raw;
}
