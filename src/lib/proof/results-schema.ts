import { z } from 'zod';
import { PageCheckResultSchema } from './artifact-schema';
import {
  ClaimIdSchema,
  ClaimStatusSchema,
  PageIdSchema,
  type EngineId,
} from './claim-schema';
import { JsonSchema } from './experiment-schema';

/** Helper for Partial<Record<EngineId, T>> without allowing unknown engine names (e.g. "safari"). */
export const perEngine = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .object({
      chromium: schema.optional(),
      firefox: schema.optional(),
      webkit: schema.optional(),
    })
    .strict();

export const CASE_STATUSES = ['pass', 'fail', 'error', 'vacuous'] as const;
export const CaseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const RunnerInfoSchema = z
  .object({
    playwright: z.string().min(1),
    node: z.string().min(1),
    /** Always process.platform (e.g. "linux"). */
    os: z.string().min(1),
    /** Version of the local React vendor bundle, or null when absent. */
    react: z.string().nullable(),
  })
  .strict();
export type RunnerInfo = z.infer<typeof RunnerInfoSchema>;

export const MeasuredObservedSchema = z
  .object({
    treatment: z
      .object({
        median: z.number().finite(),
        n: z.number().int().positive(),
      })
      .strict(),
    control: z
      .object({
        median: z.number().finite(),
        n: z.number().int().positive(),
      })
      .strict(),
    ratio: z.number().finite(),
    pValue: z.number().finite().min(0).max(1),
  })
  .strict();
export type MeasuredObserved = z.infer<typeof MeasuredObservedSchema>;

const StandardObservedSchema = z
  .object({
    treatment: JsonSchema,
    control: JsonSchema,
  })
  .strict();

export const CaseResultSchema = z
  .object({
    status: CaseStatusSchema,
    observed: z.union([MeasuredObservedSchema, StandardObservedSchema]),
    presented: z
      .object({
        treatment: JsonSchema.nullable(),
        control: JsonSchema.nullable(),
      })
      .strict()
      .nullable()
      .default(null),
    error: z.string().nullable().default(null),
  })
  .strict();
export type CaseResult = z.infer<typeof CaseResultSchema>;

export const VacuityResultSchema = z
  .object({
    ok: z.boolean(),
    checks: z
      .object({
        differs: z.boolean().nullable(),
        mutationChanges: z.boolean().nullable(),
        blankDiffers: z.boolean().nullable(),
      })
      .strict(),
    detail: z.string().nullable(),
  })
  .strict();
export type VacuityResult = z.infer<typeof VacuityResultSchema>;

export const ExperimentRunEntrySchema = z
  .object({
    sourceHash: z.string().min(1),
    runtimeVersion: z.string().min(1),
    durationMs: z.number().nonnegative(),
    vacuity: perEngine(VacuityResultSchema),
    cases: z.record(z.string(), perEngine(CaseResultSchema)),
  })
  .strict();
export type ExperimentRunEntry = z.infer<typeof ExperimentRunEntrySchema>;

export const ExperimentRunReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('experiments'),
    generatedAt: z.string().datetime(),
    runner: RunnerInfoSchema,
    engines: perEngine(z.string().min(1)),
    shard: z
      .object({
        index: z.number().int().positive(),
        total: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    experiments: z.record(z.string(), ExperimentRunEntrySchema),
  })
  .strict();
export type ExperimentRunReport = z.infer<typeof ExperimentRunReportSchema>;

export const CLAIM_ENGINE_STATUSES = ['pass', 'fail', 'error', 'missing'] as const;
export const ClaimEngineStatusSchema = z.enum(CLAIM_ENGINE_STATUSES);
export type ClaimEngineStatus = z.infer<typeof ClaimEngineStatusSchema>;

export const CLAIM_PROOF_KINDS = [
  'experiment',
  'spec-quote',
  'source-quote',
  'bcd',
  'derived',
] as const;
export const ClaimProofKindSchema = z.enum(CLAIM_PROOF_KINDS);

export const ClaimResultSchema = z
  .object({
    status: ClaimStatusSchema,
    proofKind: ClaimProofKindSchema,
    engines: perEngine(ClaimEngineStatusSchema).nullable(),
    checkedAt: z.string().datetime().nullable(),
    provenSince: z.string().datetime().nullable(),
    failingSince: z.string().datetime().nullable(),
    reason: z.string().nullable(),
    detail: z.string().nullable(),
  })
  .strict();
export type ClaimResult = z.infer<typeof ClaimResultSchema>;

export const ExperimentMetaSchema = z
  .object({
    sourceHash: z.string().min(1),
    runtimeVersion: z.string().min(1),
    vacuity: perEngine(VacuityResultSchema),
    checkedAt: z.string().datetime(),
  })
  .strict();
export type ExperimentMeta = z.infer<typeof ExperimentMetaSchema>;

export const PageResultsEntrySchema = z
  .object({
    coverage: PageCheckResultSchema.optional(),
    support: PageCheckResultSchema.optional(),
  })
  .strict();

export const DemotedPageEntrySchema = z
  .object({
    since: z.string().datetime(),
    claimIds: z.array(ClaimIdSchema),
  })
  .strict();

export const ProofResultsSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    runner: RunnerInfoSchema,
    engines: perEngine(z.string().min(1)),
    experiments: z.record(z.string(), z.record(z.string(), perEngine(CaseResultSchema))),
    experimentMeta: z.record(z.string(), ExperimentMetaSchema).default({}),
    claims: z.record(ClaimIdSchema, ClaimResultSchema),
    pages: z.record(PageIdSchema, PageResultsEntrySchema).default({}),
    demotedPages: z.record(PageIdSchema, DemotedPageEntrySchema).default({}),
  })
  .strict();
export type ProofResults = z.infer<typeof ProofResultsSchema>;

export type EngineRecord<T> = Partial<Record<EngineId, T>>;

export function emptyProofResults(): ProofResults {
  return {
    schemaVersion: 1,
    generatedAt: '1970-01-01T00:00:00.000Z',
    runner: { playwright: 'none', node: 'none', os: 'none', react: null },
    engines: {},
    experiments: {},
    experimentMeta: {},
    claims: {},
    pages: {},
    demotedPages: {},
  };
}
