import { z } from 'zod';
import { INSTRUMENT_NAMES } from '@/components/instruments/types';

export const ExperimentViewSchema = z
  .object({
    instrument: z.enum(INSTRUMENT_NAMES),
    observedPath: z.string().default(''),
    tracePath: z.string().nullable().default(null),
    presentedPath: z.string().nullable().default(null),
    compare: z.enum(['none', 'side-by-side', 'overlay']).default('side-by-side'),
    smoke: z.boolean().default(false),
    captionHint: z.string().max(120).optional(),
  })
  .strict();

export type ExperimentView = z.infer<typeof ExperimentViewSchema>;
export type ExperimentViewInput = z.input<typeof ExperimentViewSchema>;
