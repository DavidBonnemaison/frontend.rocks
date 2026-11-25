import { z } from 'zod';
import { ExperimentIdSchema, ExpectKeySchema, KEBAB_RE } from './claim-schema';
import type { Json } from './define-experiment';

export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().refine(Number.isFinite, 'numbers must be finite'),
    z.string(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
  ])
);

const ParamValueSchema = z.union([z.number(), z.boolean(), z.string()]);

export const ParamDefinitionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('range'),
      label: z.string().min(1).max(60),
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
      default: z.number(),
      unit: z.string().regex(/^[a-z%]{1,4}$/).optional(),
    })
    .strict()
    .refine(
      (p) => p.min < p.max && p.default >= p.min && p.default <= p.max,
      'range: min < max and min <= default <= max'
    ),
  z
    .object({
      kind: z.literal('toggle'),
      label: z.string().min(1).max(60),
      default: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('select'),
      label: z.string().min(1).max(60),
      options: z.array(z.string().regex(/^[a-z0-9-]+$/i)).min(2),
      default: z.string(),
    })
    .strict()
    .refine((p) => p.options.includes(p.default), 'select: default must be one of options'),
]);

/** Input selector grammar: #id, .class, [data-probe="x"], or a bare tag name. */
export const INPUT_SELECTOR_RE =
  /^(#[A-Za-z][\w-]*|\.[A-Za-z][\w-]*|\[data-probe="[a-z0-9-]+"\]|[a-z][a-z0-9]*)$/;
const SelectorSchema = z
  .string()
  .regex(INPUT_SELECTOR_RE, 'selector must be #id, .class, [data-probe="x"] or a tag name');

export const InputStepSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('click'),
      selector: SelectorSchema,
      button: z.enum(['left', 'right']).optional(),
      clickCount: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .strict(),
  z.object({ action: z.literal('tap'), selector: SelectorSchema }).strict(),
  z.object({ action: z.literal('press'), key: z.string().regex(/^[A-Za-z0-9+]{1,30}$/) }).strict(),
  z
    .object({
      action: z.literal('type'),
      selector: SelectorSchema,
      text: z.string().max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('move'),
      from: z.tuple([z.number().min(0), z.number().min(0)]),
      to: z.tuple([z.number().min(0), z.number().min(0)]),
      steps: z.number().int().min(1).max(50),
    })
    .strict(),
  z.object({ action: z.literal('wheel'), deltaX: z.number(), deltaY: z.number() }).strict(),
  z.object({ action: z.literal('wait'), ms: z.number().int().min(0).max(1000) }).strict(),
]);

export const EmulationSchema = z
  .object({
    deviceScaleFactor: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    colorScheme: z.enum(['light', 'dark']).optional(),
    reducedMotion: z.enum(['reduce', 'no-preference']).optional(),
    forcedColors: z.enum(['active', 'none']).optional(),
    hasTouch: z.boolean().optional(),
  })
  .strict();

const VariantSourcesSchema = z
  .object({
    label: z.string().min(1).max(80),
    html: z.string().optional(),
    css: z.string().optional(),
    js: z.string().optional(),
    input: z.array(InputStepSchema).min(1).max(30).optional(),
  })
  .strict();

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export const NetworkRouteSchema = z
  .object({
    id: z.string().regex(KEBAB_RE),
    origin: z.enum(['self', 'cross']),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
    path: z.string().regex(/^\/[^?#]*$/),
    status: z.number().int().min(200).max(599),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    delayMs: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine(
    (r) => !(NULL_BODY_STATUSES.has(r.status) && r.body !== undefined),
    'routes with a null-body status must not define body'
  );

export const ExpectCaseSchema = z
  .object({
    params: z.record(z.string(), ParamValueSchema).optional(),
    treatment: JsonSchema,
    control: JsonSchema,
    emulation: EmulationSchema.optional(),
  })
  .strict();

export const ExperimentBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtimeVersion: z.string().min(1),
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
    id: ExperimentIdSchema,
    title: z.string().min(5).max(80),
    question: z
      .string()
      .min(10)
      .max(200)
      .refine((q) => q.trim().endsWith('?'), 'question must end with "?"'),
    kind: z.enum(['fixture', 'trace', 'console', 'network', 'measured']),
    fixture: z
      .object({
        html: z.string(),
        css: z.string().optional(),
        js: z.string().optional(),
      })
      .strict(),
    params: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), ParamDefinitionSchema).default({}),
    variants: z
      .object({
        treatment: VariantSourcesSchema,
        control: VariantSourcesSchema,
      })
      .strict(),
    mutation: z
      .object({
        variant: z.literal('treatment'),
        remove: z.string().min(3),
      })
      .strict(),
    observeSource: z.string().min(10),
    presentSource: z.string().min(10).optional(),
    expect: z
      .record(ExpectKeySchema, ExpectCaseSchema)
      .refine((e) => Object.keys(e).length >= 1, 'at least one expect case'),
    measured: z
      .object({
        repeat: z.number().int().min(15).max(60),
        metric: z.string().min(3).max(60),
        minRatio: z.number().min(1.2),
      })
      .strict()
      .optional(),
    viewport: z
      .object({
        width: z.number().int().min(320).max(1920),
        height: z.number().int().min(240).max(1200),
      })
      .strict()
      .default({ width: 1280, height: 800 }),
    network: z
      .object({
        mode: z.enum(['shim', 'server']),
        routes: z.array(NetworkRouteSchema).min(1),
      })
      .strict()
      .optional(),
    consoleSource: z.enum(['page', 'engine']).default('page'),
    host: z.enum(['opaque', 'origin']).default('opaque'),
    serviceWorker: z.string().min(10).max(20_000).optional(),
    vendor: z.array(z.enum(['react', 'react-dom'])).min(1).max(2).optional(),
    liveInBrowser: z.boolean(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.serviceWorker && b.host !== 'origin') {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceWorker'],
        message: 'serviceWorker requires host "origin"',
      });
    }
    if (b.vendor && new Set(b.vendor).size !== b.vendor.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['vendor'],
        message: 'vendor contains duplicates',
      });
    }
  });

export type ExperimentBundle = z.infer<typeof ExperimentBundleSchema>;
export type ExperimentBundleIndexEntry = Pick<
  ExperimentBundle,
  'id' | 'title' | 'kind' | 'sourceHash' | 'host' | 'liveInBrowser'
>;

/** Computed by the experiment build step; never authored manually. */
export function computeLiveInBrowser(b: Omit<ExperimentBundle, 'liveInBrowser'>): boolean {
  const hasInput = Boolean(b.variants.treatment.input?.length || b.variants.control.input?.length);
  const hasEmulation = Object.values(b.expect).some(
    (c) => c.emulation && Object.keys(c.emulation).length > 0
  );
  return (
    !hasInput &&
    !hasEmulation &&
    b.network?.mode !== 'server' &&
    b.consoleSource !== 'engine' &&
    b.kind !== 'measured'
  );
}
