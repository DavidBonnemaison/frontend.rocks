import { z } from 'zod';

export const RedirectRuleSchema = z.object({
  from: z.string().regex(/^\/[a-z0-9/_.-]*\*?$/, 'Invalid redirect source path'),
  to: z.string().regex(/^\/[a-z0-9/_.#-]*$/, 'Invalid redirect target path'),
  status: z.union([z.literal(301), z.literal(302), z.literal(410)]),
});
export type RedirectRule = z.infer<typeof RedirectRuleSchema>;

export const RedirectsFileSchema = z.object({
  source: z.string().min(1),
  rules: z.array(RedirectRuleSchema),
});
export type RedirectsFile = z.infer<typeof RedirectsFileSchema>;
