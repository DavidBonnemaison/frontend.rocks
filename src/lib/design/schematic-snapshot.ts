import { z } from 'zod';

export const GeometryBoxSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number().nonnegative(),
    h: z.number().nonnegative(),
    z: z.number().optional(),
    dashed: z.boolean().optional(),
    highlight: z.boolean().optional(),
  })
  .strict();

export const GeometryDimensionSchema = z
  .object({
    from: z.tuple([z.number(), z.number()]),
    to: z.tuple([z.number(), z.number()]),
    label: z.string().min(1),
  })
  .strict();

export const GeometrySnapshotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    source: z
      .object({
        experimentId: z.string().min(1),
        variant: z.enum(['treatment', 'control']),
        params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
      })
      .strict(),
    engine: z
      .object({
        name: z.literal('chromium'),
        version: z.string().min(1),
      })
      .strict(),
    viewport: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict(),
    boxes: z.array(GeometryBoxSchema).min(1),
    dimensions: z.array(GeometryDimensionSchema),
    caption: z.string().max(160),
    sourceHash: z.string().min(1),
  })
  .strict();

export type GeometrySnapshot = z.infer<typeof GeometrySnapshotSchema>;

export const SchematicSpecSchema = z
  .object({
    snapshots: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            variant: z.enum(['treatment', 'control']),
            params: z
              .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
              .default({}),
            boxes: z
              .array(
                z
                  .object({
                    key: z.string().min(1),
                    selector: z.string().min(1),
                    label: z.string().min(1),
                    dashed: z.boolean().default(false),
                    highlight: z.boolean().default(false),
                  })
                  .strict()
              )
              .min(1)
              .max(24),
            dimensions: z
              .array(
                z
                  .object({
                    fromKey: z.string().min(1),
                    toKey: z.string().min(1),
                    axis: z.enum(['x', 'y']),
                    label: z.string().min(1),
                  })
                  .strict()
              )
              .max(8)
              .default([]),
            caption: z.string().max(120),
          })
          .strict()
      )
      .min(1)
      .max(6),
  })
  .strict();

export type SchematicSpec = z.infer<typeof SchematicSpecSchema>;
