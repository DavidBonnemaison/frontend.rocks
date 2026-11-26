import { z } from 'zod';

export interface BoxNode {
  id: string;
  label: string;
  display: string;
  flags: string[];
  children: BoxNode[];
}

export const BoxNodeSchema: z.ZodType<BoxNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string().max(40),
    display: z.string().max(30),
    flags: z.array(z.string().max(30)).max(6).default([]),
    children: z.array(BoxNodeSchema).max(30),
  }),
);

export const BoxTreeObservedSchema = z.object({
  root: BoxNodeSchema,
});

export type BoxTreeObserved = z.infer<typeof BoxTreeObservedSchema>;

export const BoxSizeSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export type BoxSize = z.infer<typeof BoxSizeSchema>;

export const BoxTreeTraceSchema = z.object({
  sizes: z.record(z.string(), BoxSizeSchema),
});

export type BoxTreeTrace = z.infer<typeof BoxTreeTraceSchema>;
