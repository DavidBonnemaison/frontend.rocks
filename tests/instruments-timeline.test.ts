import { describe, expect, it } from 'vitest';
import { createLinearScale, niceTicks } from '@/components/instruments/timeline/scale';
import {
  TimelineObservedSchema,
  TimelineTraceSchema,
} from '@/components/instruments/timeline/schema';
import {
  TIMELINE_ORDINAL,
  TIMELINE_TRACE,
} from '@/components/instruments/__fixtures__/timeline';

describe('Timeline scale utilities', () => {
  it('computes nice 1-2-5 ticks for [0, 37]', () => {
    expect(niceTicks([0, 37])).toEqual([0, 10, 20, 30]);
  });

  it('computes nice ticks for small decimal ranges and large ranges', () => {
    expect(niceTicks([0, 1], 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks([0, 1000], 5)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks([5, 5])).toEqual([5]);
  });

  it('maps values linearly and handles degenerate zero-span domains', () => {
    const s = createLinearScale([0, 100], [50, 250]);
    expect(s(0)).toBe(50);
    expect(s(50)).toBe(150);
    expect(s(100)).toBe(250);

    const flat = createLinearScale([10, 10], [0, 200]);
    expect(flat(10)).toBe(100);
  });

  it('validates canonical Timeline fixtures', () => {
    expect(TimelineObservedSchema.safeParse(TIMELINE_ORDINAL).success).toBe(true);
    expect(TimelineTraceSchema.safeParse(TIMELINE_TRACE).success).toBe(true);
  });
});
