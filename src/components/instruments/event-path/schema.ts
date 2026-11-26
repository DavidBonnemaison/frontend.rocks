import { z } from 'zod';

export const EventPathStepSchema = z.object({
  node: z.string().max(40),
  phase: z.enum(['capture', 'target', 'bubble']),
  listenersCalled: z.number().int().nonnegative(),
  stopped: z.boolean().default(false),
  targetSeenAs: z.string().max(40).optional(),
});

export type EventPathStep = z.infer<typeof EventPathStepSchema>;

export const EventPathObservedSchema = z.object({
  type: z.string().max(30),
  steps: z.array(EventPathStepSchema).min(1).max(40),
});

export type EventPathObserved = z.infer<typeof EventPathObservedSchema>;

export interface AnnotatedEventStep {
  index: number;
  step: EventPathStep;
  unreached: boolean;
  shadowBoundary: boolean;
  retargeted: boolean;
}

export function annotateEventPath(steps: EventPathStep[]): AnnotatedEventStep[] {
  let stoppedSeen = false;
  let lastTargetSeen: string | undefined;

  return steps.map((step, index) => {
    const unreached = stoppedSeen;
    if (step.stopped) stoppedSeen = true;

    const shadowBoundary = /shadow[- ]?root/i.test(step.node);
    const retargeted =
      step.targetSeenAs !== undefined &&
      lastTargetSeen !== undefined &&
      step.targetSeenAs !== lastTargetSeen;

    if (step.targetSeenAs !== undefined) {
      lastTargetSeen = step.targetSeenAs;
    }

    return {
      index,
      step,
      unreached,
      shadowBoundary,
      retargeted,
    };
  });
}

export function splitEventPhases(steps: EventPathStep[]): {
  capture: EventPathStep[];
  target: EventPathStep[];
  bubble: EventPathStep[];
} {
  return {
    capture: steps.filter((s) => s.phase === 'capture'),
    target: steps.filter((s) => s.phase === 'target'),
    bubble: steps.filter((s) => s.phase === 'bubble'),
  };
}
