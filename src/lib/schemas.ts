import { z } from 'zod';
import {
  PAGE_PROOF_STATUSES,
  PageProofStatusSchema,
  type PageProofStatus,
} from './proof/claim-schema';

export { PAGE_PROOF_STATUSES, PageProofStatusSchema, type PageProofStatus };

export const DOMAIN_VALUES = [
  'rendering-pipeline',
  'css-layout',
  'js-runtime',
  'dom-events',
  'network-perf',
  'state-architecture',
  'software-architecture',
  'web-apis',
  'security-a11y',
  'framework-internals',
  'testing-verification',
] as const;

export const DomainSchema = z.enum(DOMAIN_VALUES);
export type Domain = z.infer<typeof DomainSchema>;

export const MATURITY_VALUES = [
  'baseline-widely',
  'baseline-newly',
  'interop-experimental',
  'legacy-pattern',
  'superseded',
] as const;

export const MaturityStatusSchema = z.enum(MATURITY_VALUES);
export type MaturityStatus = z.infer<typeof MaturityStatusSchema>;

export const RELATION_TYPES = [
  'requires',
  'under_the_hood',
  'replaces',
  'contrasts_with',
] as const;

export const RelationTypeSchema = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RelationSchema = z.object({
  target_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: RelationTypeSchema,
  note: z.string().min(20, 'Relation note must be at least 20 characters'),
});
export type ConceptRelation = z.infer<typeof RelationSchema>;

export const PATTERN_STATUS_VALUES = ['legacy-pattern', 'superseded'] as const;
export const PatternStatusSchema = z.enum(PATTERN_STATUS_VALUES);
export type PatternStatus = z.infer<typeof PatternStatusSchema>;

export const ConceptFrontmatterFileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be a lowercase kebab-case slug'),
    title: z.string().min(2).max(120),
    domain: DomainSchema,
    pattern_status: PatternStatusSchema.optional(),
    superseded_by: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).optional(),
    summary_tldr: z
      .string()
      .min(10)
      .max(280, 'summary_tldr must be strictly <= 280 characters'),
    relations: z.array(RelationSchema),
    sources: z.array(z.string().url()).min(1, 'At least one primary source URL is required'),
    last_verified_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'last_verified_at must be ISO-8601 YYYY-MM-DD'),
    proof_status: PageProofStatusSchema.default('unverified'),
    keywords: z.array(z.string().min(1)).optional(),
    lab_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    web_feature_id: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((fm, ctx) => {
    if (fm.pattern_status && (!fm.superseded_by || fm.superseded_by.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['superseded_by'],
        message: 'superseded_by must contain at least one concept id when pattern_status is set',
      });
    }
  });

export type ConceptFrontmatterFile = z.infer<typeof ConceptFrontmatterFileSchema>;
/** Frontmatter after loading: maturity_status is computed, never read from the file. */
export type ConceptFrontmatter = ConceptFrontmatterFile & {
  maturity_status: MaturityStatus | null;
};

// --- InteractivePrimitive Schemas ---

export const StepMachineNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['idle', 'active', 'done', 'error']).default('idle'),
});

export const StepMachineStepSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  codeHighlight: z.string().optional(),
  state: z.record(z.string(), z.unknown()),
  visualNodes: z.array(StepMachineNodeSchema).optional(),
});

export const StepMachineLabSchema = z.object({
  type: z.literal('step-machine'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(StepMachineStepSchema).min(2),
});
export type StepMachineLabConfig = z.infer<typeof StepMachineLabSchema>;

export const PatternVariantSchema = z.object({
  label: z.string().min(1),
  code: z.string().min(1),
  metrics: z.object({
    lines: z.number().int().nonnegative(),
    reflows: z.string().min(1),
    dependencies: z.string().min(1),
  }),
  previewNote: z.string().optional(),
});

export const PatternComparatorLabSchema = z.object({
  type: z.literal('pattern-comparator'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  before: PatternVariantSchema,
  after: PatternVariantSchema,
});
export type PatternComparatorLabConfig = z.infer<typeof PatternComparatorLabSchema>;

export const SimulatorControlSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['range', 'toggle', 'select']),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.number(), z.boolean(), z.string()]),
  unit: z.string().optional(),
});

export const ConstraintSimulatorLabSchema = z.object({
  type: z.literal('constraint-simulator'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  presetMode: z.enum([
    'stacking-context',
    'layout-thrashing',
    'composite-layers',
    'container-query',
    'brotli-dictionary',
    'inp-budget',
    'long-task-inp',
    'cross-origin-isolation',
    'event-coalescing',
    'memory-retainers',
    'streams-backpressure',
    'virtualized-list',
  ]),
  controls: z.array(SimulatorControlSchema).min(1).max(4),
});
export type ConstraintSimulatorLabConfig = z.infer<typeof ConstraintSimulatorLabSchema>;

export const LiveSandboxControlSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['range', 'toggle', 'select']),
  target: z.enum(['css-var', 'class']),
  cssVar: z
    .string()
    .regex(/^--[a-z0-9-]+$/i, 'cssVar must be a valid CSS custom property starting with --')
    .optional(),
  className: z.string().min(1).optional(),
  classPrefix: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string().min(1)).optional(),
  defaultValue: z.union([z.number(), z.boolean(), z.string()]),
  unit: z.string().optional(),
});
export type LiveSandboxControl = z.infer<typeof LiveSandboxControlSchema>;

export const LiveSandboxLabSchema = z.object({
  type: z.literal('live-sandbox'),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  html: z.string().min(1),
  css: z.string().min(1),
  js: z.string().optional(),
  controls: z.array(LiveSandboxControlSchema).min(1).max(4),
  expectedObservation: z.string().min(10),
  height: z.number().int().min(140).max(520).optional(),
});
export type LiveSandboxLabConfig = z.infer<typeof LiveSandboxLabSchema>;

export const InteractivePrimitiveSchema = z.discriminatedUnion('type', [
  StepMachineLabSchema,
  PatternComparatorLabSchema,
  ConstraintSimulatorLabSchema,
  LiveSandboxLabSchema,
]);
export type InteractivePrimitiveConfig = z.infer<typeof InteractivePrimitiveSchema>;

// --- WeeklyDigest Schema ---

export const DIGEST_CATEGORIES = [
  'spec-update',
  'browser-release',
  'obsolescence-alert',
  'deep-dive',
] as const;

export const DigestEntrySchema = z.object({
  title: z.string().min(3),
  source_url: z.string().url(),
  category: z.enum(DIGEST_CATEGORIES),
  editorial_take: z.string().min(20),
  impact_score: z.number().min(1).max(10).optional(),
  related_concepts: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1),
});

export const WeeklyDigestSchema = z.object({
  id: z.string().regex(/^\d{4}-w\d{2}$/, 'Digest id must follow YYYY-wWW format'),
  title: z.string().min(3),
  published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().min(10),
  entries: z.array(DigestEntrySchema).min(5).max(8),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

// --- EvidenceDossier Schema (EPIC-06) ---

export const EvidenceDossierSchema = z.object({
  concept_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  compiled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  normative_extracts: z
    .array(
      z.object({
        source_url: z.string().url(),
        spec_section: z.string().min(1),
        quote: z.string().min(10),
      })
    )
    .min(1),
  browser_support: z.object({
    baseline_status: MaturityStatusSchema,
    chrome: z.string().min(1),
    firefox: z.string().min(1),
    safari: z.string().min(1),
    notes: z.string().optional(),
  }),
  engine_internals: z.object({
    pipeline_phases: z.array(z.string().min(1)).min(1),
    mechanism_summary: z.string().min(20),
  }),
  production_failures: z
    .array(
      z.object({
        symptom: z.string().min(5),
        root_cause: z.string().min(10),
        mitigation: z.string().min(10),
      })
    )
    .min(2, 'At least 2 documented production failure cases are required'),
  sources: z.array(z.string().url()).min(1),
});
export type EvidenceDossier = z.infer<typeof EvidenceDossierSchema>;

// --- Learning Paths & Homepage Symptom Config Schemas (EPIC-11) ---

export const LearningPathSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be a lowercase kebab-case slug'),
  title: z.string().min(3).max(120),
  subtitle: z.string().min(10).max(280).optional(),
  description: z.string().min(10).max(280),
  estimatedMinutes: z.number().int().positive(),
  concepts: z
    .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
    .min(3, 'A learning path must include at least 3 concepts'),
});
export type LearningPath = z.infer<typeof LearningPathSchema>;

export const LearningPathsFileSchema = z.object({
  paths: z.array(LearningPathSchema).min(1),
});
export type LearningPathsFile = z.infer<typeof LearningPathsFileSchema>;

// --- AutopsyCase Schema (EPIC-13) ---

export const FAILURE_MODE_VALUES = [
  'silent-data-corruption',
  'main-thread-freeze',
  'memory-exhaustion',
  'cascading-latency',
  'hydration-desync',
  'false-positive-ci',
] as const;

export const FailureModeSchema = z.enum(FAILURE_MODE_VALUES);
export type FailureMode = z.infer<typeof FailureModeSchema>;

export const TraversedConceptSchema = z.object({
  concept_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  step_order: z.number().int().positive(),
  role_in_chain: z
    .string()
    .min(25, 'role_in_chain must be at least 25 characters explaining the mechanical role'),
});
export type TraversedConcept = z.infer<typeof TraversedConceptSchema>;

export const AUTOPSY_CAST_VALUES = [
  'julie',
  'karim',
  'nadia',
  'marc',
  'ines',
  'thomas',
] as const;

export const AutopsyCastMemberSchema = z.enum(AUTOPSY_CAST_VALUES);
export type AutopsyCastMember = z.infer<typeof AutopsyCastMemberSchema>;

export const AutopsyBadFixSchema = z.object({
  label: z.string().min(3).max(80),
  outcome: z.string().min(5).max(180),
});

export const AutopsyCaseFileSchema = z.object({
  trigger: z.string().min(10).max(200),
  symptom: z.string().min(10).max(200),
  root_cause: z.string().min(10).max(220),
  bad_fixes: z.array(AutopsyBadFixSchema).min(1).max(4),
  fix: z.string().min(10).max(220),
  how_to_spot: z.string().min(10).max(200),
  deleted: z.string().min(5).max(200).optional(),
});
export type AutopsyCaseFile = z.infer<typeof AutopsyCaseFileSchema>;

export const AutopsyFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be a lowercase kebab-case slug'),
  case_number: z.number().int().min(1).max(99),
  title: z.string().min(5).max(160),
  symptom: z
    .string()
    .min(10)
    .max(160, 'symptom must be <= 160 characters'),
  failure_mode: FailureModeSchema,
  format: z.enum(['narrative', 'legacy']).default('narrative'),
  case_type: z.enum(['composite', 'reconstructed']).default('composite'),
  cast: z.array(AutopsyCastMemberSchema).min(2).max(4),
  traversed_concepts: z
    .array(TraversedConceptSchema)
    .min(4, 'traversed_concepts must contain 4 to 6 concepts')
    .max(6, 'traversed_concepts must contain 4 to 6 concepts'),
  case_file: AutopsyCaseFileSchema,
  reading_time_min: z.number().int().positive(),
  sources: z.array(z.string().url()).min(1, 'At least one primary source URL is required'),
  last_verified_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'last_verified_at must be ISO-8601 YYYY-MM-DD'),
  proof_status: PageProofStatusSchema.default('unverified'),
  lab_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});

export type AutopsyFrontmatter = z.infer<typeof AutopsyFrontmatterSchema>;



