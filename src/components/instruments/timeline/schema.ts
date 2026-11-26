import { z } from 'zod';

export const TimelineEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  lane: z.string().max(40),
  label: z.string().max(80),
  status: z.enum(['neutral', 'ok', 'warn', 'fail']).default('neutral'),
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const TimelineObservedSchema = z.object({
  events: z.array(TimelineEventSchema).min(1).max(1000),
});

export type TimelineObserved = z.infer<typeof TimelineObservedSchema>;

export const TimelineTraceEntrySchema = z.object({
  seq: z.number().int(),
  t: z.number(),
  duration: z.number().nonnegative().optional(),
});

export type TimelineTraceEntry = z.infer<typeof TimelineTraceEntrySchema>;

export const TimelineTraceSchema = z.array(TimelineTraceEntrySchema);

export type TimelineTrace = z.infer<typeof TimelineTraceSchema>;
