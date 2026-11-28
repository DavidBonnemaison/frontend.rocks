import { z } from 'zod';

const PageKindCountsSchema = z
  .object({
    concept: z.number().int().nonnegative(),
    autopsy: z.number().int().nonnegative(),
    symptom: z.number().int().nonnegative(),
    vs: z.number().int().nonnegative(),
  })
  .strict();

const SummaryClaimsCountsSchema = z
  .object({
    candidates: z.number().int().nonnegative(),
    proven: z.number().int().nonnegative(),
    narrowed: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
  })
  .strict();

export const RecertSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    pagesBefore: PageKindCountsSchema,
    pagesProven: PageKindCountsSchema,
    pagesMerged: z.number().int().nonnegative(),
    pagesDeleted: z.number().int().nonnegative(),
    claims: SummaryClaimsCountsSchema,
    dropRate: z.number().min(0).max(1),
  })
  .strict();

export type RecertSummary = z.infer<typeof RecertSummarySchema>;
