import { describe, expect, it } from 'vitest';
import {
  annotateEventPath,
  EventPathObservedSchema,
  splitEventPhases,
} from '@/components/instruments/event-path/schema';
import { EVENT_PATH_ORDINAL } from '@/components/instruments/__fixtures__/event-path';

describe('EventPath utilities', () => {
  it('validates fixture and splits capture, target, and bubble phases', () => {
    expect(EventPathObservedSchema.safeParse(EVENT_PATH_ORDINAL).success).toBe(true);
    const phases = splitEventPhases(EVENT_PATH_ORDINAL.steps);
    expect(phases.capture).toHaveLength(3);
    expect(phases.target).toHaveLength(1);
    expect(phases.bubble).toHaveLength(3);
  });

  it('marks steps after stopped as unreached and detects shadow boundaries and retargeting', () => {
    const annotated = annotateEventPath(EVENT_PATH_ORDINAL.steps);
    expect(annotated[2].shadowBoundary).toBe(true);
    expect(annotated[2].retargeted).toBe(true);
    expect(annotated[3].step.stopped).toBe(true);
    expect(annotated[3].unreached).toBe(false);

    // Every step after index 3 is unreached
    expect(annotated[4].unreached).toBe(true);
    expect(annotated[5].unreached).toBe(true);
    expect(annotated[6].unreached).toBe(true);

    // Retargeting back to my-menu outside shadow root
    expect(annotated[5].retargeted).toBe(true);
    expect(annotated[5].step.targetSeenAs).toBe('my-menu');
  });
});
