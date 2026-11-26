import { z } from 'zod';

/** FrameBudget reads `measured` (MeasuredSummary); observed is not constrained. */
export const FrameBudgetObservedSchema = z.unknown();

export type FrameBudgetObserved = unknown;

export const FrameSampleSchema = z.object({
  start: z.number(),
  end: z.number(),
});

export type FrameSample = z.infer<typeof FrameSampleSchema>;

export const FrameBudgetTraceSchema = z.object({
  frames: z.array(FrameSampleSchema).min(2).max(600),
  longTasks: z.array(z.object({ start: z.number(), duration: z.number() })).default([]),
  marks: z.array(z.object({ t: z.number(), label: z.string().max(40) })).default([]),
});

export type FrameBudgetTrace = z.infer<typeof FrameBudgetTraceSchema>;
