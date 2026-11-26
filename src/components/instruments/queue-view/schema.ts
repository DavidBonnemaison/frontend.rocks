import { z } from 'zod';

export const QueueEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  op: z.enum(['schedule', 'run-start', 'run-end', 'render']),
  queue: z.enum(['task', 'microtask', 'raf', 'render']),
  label: z.string().max(60),
});

export type QueueEvent = z.infer<typeof QueueEventSchema>;

export const QueueObservedSchema = z.object({
  events: z.array(QueueEventSchema).min(1).max(500),
});

export type QueueObserved = z.infer<typeof QueueObservedSchema>;

export const QueueTraceEntrySchema = z.object({
  seq: z.number().int(),
  t: z.number(),
});

export const QueueTraceSchema = z.array(QueueTraceEntrySchema);

export type QueueTrace = z.infer<typeof QueueTraceSchema>;
