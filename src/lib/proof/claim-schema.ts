import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CLAIM_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PageIdSchema = z.string().regex(KEBAB_RE, 'pageId must be a lowercase kebab-case slug');
export const ClaimIdSchema = z
  .string()
  .regex(CLAIM_ID_RE, 'claim id must be "<page-id>/<claim-slug>" in kebab-case');
/** `index` and `vendor` are reserved because `public/experiments/index.json` and `public/experiments/vendor/` share the bundles directory. */
export const RESERVED_EXPERIMENT_IDS = ['index', 'vendor'] as const;
export const ExperimentIdSchema = z
  .string()
  .regex(KEBAB_RE, 'experimentId must be kebab-case')
  .refine(
    (id) => !(RESERVED_EXPERIMENT_IDS as readonly string[]).includes(id),
    'experimentId "index" and "vendor" are reserved'
  );
export const ExpectKeySchema = z.string().regex(KEBAB_RE, 'expect key must be kebab-case');

export const ENGINE_IDS = ['chromium', 'firefox', 'webkit'] as const;
export const EngineIdSchema = z.enum(ENGINE_IDS);
export type EngineId = z.infer<typeof EngineIdSchema>;

export const PRE_RELEASE_ENGINE_IDS = ['chrome-beta'] as const;
export const PreReleaseEngineIdSchema = z.enum(PRE_RELEASE_ENGINE_IDS);
export type PreReleaseEngineId = z.infer<typeof PreReleaseEngineIdSchema>;

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const PAGE_PROOF_STATUSES = ['unverified', 'proven'] as const;
export const PageProofStatusSchema = z.enum(PAGE_PROOF_STATUSES);
export type PageProofStatus = z.infer<typeof PageProofStatusSchema>;

export const CLAIM_STATUSES = ['pending', 'proven', 'diverges', 'failed', 'stale'] as const;
export const ClaimStatusSchema = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export const UNANCHORED = '__unanchored__';

export const CLAIM_TYPES = [
  'observable',
  'normative',
  'implementation',
  'support',
  'measured',
  'derived',
] as const;
export const ClaimTypeSchema = z.enum(CLAIM_TYPES);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const SOURCE_REPOS = [
  'chromium/chromium',
  'v8/v8',                              // V8 lives outside the Chromium tree
  'WebKit/WebKit',
  'mozilla-firefox/firefox',
  'ChromeDevTools/devtools-frontend',   // DevTools UI strings for symptom signatures
  'react/react',                        // React implementation claims (formerly facebook/react)
  'jsdom/jsdom',                        // JSDOM claims (testing-verification domain)
] as const;

const ExperimentProofSchema = z
  .object({
    kind: z.literal('experiment'),
    experimentId: ExperimentIdSchema,
    expectKeys: z.array(ExpectKeySchema).min(1),
  })
  .strict();

const SpecQuoteProofSchema = z
  .object({
    kind: z.literal('spec-quote'),
    url: z
      .string()
      .url()
      .refine((u) => !u.includes('#'), 'spec-quote url must not contain a fragment; put it in "anchor"'),
    anchor: z.string().min(1),
    quote: z.string().min(20).max(600),
  })
  .strict();

const SourceQuoteProofSchema = z
  .object({
    kind: z.literal('source-quote'),
    repo: z.enum(SOURCE_REPOS),
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'commit must be a full 40-char lowercase SHA'),
    path: z.string().min(1),
    lines: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .refine(([a, b]) => a <= b, 'lines must be [start, end] with start <= end'),
    quote: z.string().min(10),
  })
  .strict();

const BcdProofSchema = z
  .object({
    kind: z.literal('bcd'),
    bcdKey: z
      .string()
      .regex(/^[a-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/, 'bcdKey must look like "css.properties.container-type"'),
    webFeatureId: z.string().min(1).optional(),
  })
  .strict();

const DerivedProofSchema = z
  .object({
    kind: z.literal('derived'),
    from: z.array(ClaimIdSchema).min(1),
    reasoning: z.string().min(20).max(400),
  })
  .strict();

export const ClaimProofSchema = z.discriminatedUnion('kind', [
  ExperimentProofSchema,
  SpecQuoteProofSchema,
  SourceQuoteProofSchema,
  BcdProofSchema,
  DerivedProofSchema,
]);
export type ClaimProof = z.infer<typeof ClaimProofSchema>;
export type ClaimProofKind = ClaimProof['kind'];

/** Only allowed mapping from claim type to proof kind. */
export const TYPE_TO_KIND: Record<ClaimType, ClaimProofKind> = {
  observable: 'experiment',
  measured: 'experiment',
  normative: 'spec-quote',
  implementation: 'source-quote',
  support: 'bcd',
  derived: 'derived',
};

export const ClaimSchema = z
  .object({
    id: ClaimIdSchema,
    type: ClaimTypeSchema,
    statement: z
      .string()
      .min(20)
      .max(280)
      .refine((s) => s === s.trim(), 'statement must not have leading/trailing whitespace'),
    scope: z
      .object({
        engines: z.array(EngineIdSchema).min(1).optional(),
      })
      .strict()
      .optional(),
    proof: ClaimProofSchema,
  })
  .strict()
  .superRefine((claim, ctx) => {
    const expected = TYPE_TO_KIND[claim.type];
    if (claim.proof.kind !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['proof', 'kind'],
        message: `claim type "${claim.type}" requires proof kind "${expected}", got "${claim.proof.kind}"`,
      });
    }
    if (claim.scope?.engines) {
      const unique = new Set(claim.scope.engines);
      if (unique.size !== claim.scope.engines.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['scope', 'engines'],
          message: 'scope.engines contains duplicates',
        });
      }
    }
    if (claim.proof.kind === 'derived' && claim.proof.from.includes(claim.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['proof', 'from'],
        message: 'a derived claim cannot derive from itself',
      });
    }
  });
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimsFileSchema = z
  .object({
    pageId: PageIdSchema,
    claims: z.array(ClaimSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.claims.forEach((claim, index) => {
      if (!claim.id.startsWith(`${file.pageId}/`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', index, 'id'],
          message: `claim id "${claim.id}" must start with "${file.pageId}/"`,
        });
      }
      if (seen.has(claim.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', index, 'id'],
          message: `duplicate claim id "${claim.id}"`,
        });
      }
      seen.add(claim.id);
    });
  });
export type ClaimsFile = z.infer<typeof ClaimsFileSchema>;

/** "css-container-queries/applies" -> { pageId: "css-container-queries", slug: "applies" } */
export function splitClaimId(id: string): { pageId: string; slug: string } {
  const parsed = ClaimIdSchema.parse(id);
  const [pageId, slug] = parsed.split('/');
  return { pageId, slug };
}

export function makeClaimId(pageId: string, slug: string): string {
  return ClaimIdSchema.parse(`${pageId}/${slug}`);
}
