import { z } from 'zod';
import { ClaimIdSchema, EngineIdSchema, ExperimentIdSchema, PageIdSchema } from '../proof/claim-schema';

export const SIGNATURE_KINDS = ['console', 'devtools-ui', 'metric'] as const;

export const SymptomSignatureSchema = z.object({
  kind: z.enum(SIGNATURE_KINDS),
  /** Written by the script, never by a model: captured console text, quoted DevTools UI string or qualitative metric. */
  text: z.string().min(5).max(300),
  /** Claim slug of this page, or a full ClaimId. */
  claim: z.string().min(1),
  engines: z.array(EngineIdSchema).min(1),
});
export type SymptomSignature = z.infer<typeof SymptomSignatureSchema>;

export const SymptomFrontmatterSchema = z
  .object({
    id: PageIdSchema,
    title: z.string().min(10).max(120),
    featured: z.boolean().default(false),
    summary: z.string().min(20).max(280),
    summary_claims: z.array(ClaimIdSchema).default([]),
    signatures: z.array(SymptomSignatureSchema).max(5).default([]),
    devtools_check: z
      .object({ text: z.string().min(10).max(200), claim: z.string().min(1) })
      .optional(),
    repro_experiment_id: ExperimentIdSchema.optional(),
    keywords: z.array(z.string().min(2).max(40)).max(20).default([]),
    concept_ids: z.array(PageIdSchema).min(1),
    autopsy_ids: z.array(PageIdSchema).default([]),
    proof_status: z.enum(['unverified', 'proven']),
  })
  .superRefine((fm, ctx) => {
    if (fm.proof_status !== 'proven') return;
    if (fm.summary_claims.length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['summary_claims'],
        message: 'summary_claims is required when proof_status is "proven"',
      });
    }
    if (fm.signatures.length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['signatures'],
        message: 'at least one signature is required when proof_status is "proven"',
      });
    }
  });

export type SymptomFrontmatter = z.infer<typeof SymptomFrontmatterSchema>;

/** Fixed `##` section titles of a symptom page body (README-level contract, EPIC-35 §4.4). */
export const SYMPTOM_SECTIONS = [
  'What you see',
  'Likely causes',
  'Confirm it',
  'Fix',
  'Reproduce it',
] as const;
