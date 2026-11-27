import { z } from 'zod';

export const ChallengeSchema = z
  .object({
    goal: z.string().min(20).max(160),
    startFrom: z.enum(['treatment', 'control']),
    editable: z.enum(['css', 'js', 'html']),
    expectKey: z.string().min(1),
    hint: z.string().max(200).optional(),
    forbid: z.array(z.string()).max(10).default([]),
  })
  .strict();

export type Challenge = z.infer<typeof ChallengeSchema>;
export type ChallengeInput = z.input<typeof ChallengeSchema>;
