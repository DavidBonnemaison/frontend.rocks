import { z } from 'zod';

export const LayerNodeSchema = z
  .object({
    id: z.string(),
    label: z.string().max(40),
    zIndex: z.union([z.number().int(), z.literal('auto')]),
    createsStackingContext: z.boolean(),
    parent: z.string().nullable(),
    topLayer: z.boolean().default(false),
  })
  .strict();

export type LayerNode = z.infer<typeof LayerNodeSchema>;

export const LayerStackObservedSchema = z
  .object({
    nodes: z.array(LayerNodeSchema).min(1).max(40),
    probe: z.object({ hitId: z.string().nullable() }).strict().optional(),
  })
  .strict();

export type LayerStackObserved = z.infer<typeof LayerStackObservedSchema>;

export const LayerRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type LayerRect = z.infer<typeof LayerRectSchema>;

export const LayerStackTraceSchema = z.object({
  rects: z.record(z.string(), LayerRectSchema),
  probePoint: z.object({ x: z.number(), y: z.number() }).optional(),
});

export type LayerStackTrace = z.infer<typeof LayerStackTraceSchema>;
