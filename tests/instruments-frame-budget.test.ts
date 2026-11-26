import { describe, expect, it } from 'vitest';
import {
  computeFrameStats,
  describeMeasured,
} from '@/components/instruments/frame-budget/build';
import { FrameBudgetTraceSchema } from '@/components/instruments/frame-budget/schema';
import {
  FRAME_BUDGET_MEASURED,
  FRAME_BUDGET_TRACE_60HZ,
  FRAME_BUDGET_TRACE_SHORT,
} from '@/components/instruments/__fixtures__/frame-budget';

describe('FrameBudget pure builders', () => {
  it('describes measured summary in both directions without hardcoding sign', () => {
    const forward = describeMeasured(FRAME_BUDGET_MEASURED, {
      primary: 'Without the fix',
      secondary: 'Batched reads',
    });
    expect(forward.slowerLabel).toBe('Without the fix');
    expect(forward.factor).toBe(8.7);
    expect(forward.announce).toBe('Without the fix: 8.7 times slower (median of 15 runs).');
    expect(forward.bars[0].slower).toBe(true);
    expect(forward.bars[1].slower).toBe(false);

    const reversed = describeMeasured(
      {
        treatment: { median: 20, n: 12 },
        control: { median: 100, n: 12 },
        ratio: 0.2,
        pValue: 0.004,
      },
      { primary: 'Optimized', secondary: 'Baseline' },
    );
    expect(reversed.slowerLabel).toBe('Baseline');
    expect(reversed.factor).toBe(5.0);
    expect(reversed.bars[0].slower).toBe(false);
    expect(reversed.bars[1].slower).toBe(true);
  });

  it('derives refreshMs from observed frames at 60 Hz and 120 Hz and detects dropped frames', () => {
    expect(FrameBudgetTraceSchema.safeParse(FRAME_BUDGET_TRACE_60HZ).success).toBe(true);
    const stats60 = computeFrameStats(FRAME_BUDGET_TRACE_60HZ.frames);
    expect(stats60.sufficient).toBe(true);
    expect(stats60.refreshMs).toBeCloseTo(16.7, 0);
    expect(stats60.droppedCount).toBe(1);
    expect(stats60.intervals[4].dropped).toBe(true);

    // Simulated 120 Hz display (~8.3 ms per frame, one 18 ms drop)
    const frames120 = Array.from({ length: 12 }, (_, i) => {
      const dur = i === 5 ? 18.0 : 8.3;
      const start = i * 8.3;
      return { start, end: start + dur };
    });
    const stats120 = computeFrameStats(frames120);
    expect(stats120.sufficient).toBe(true);
    expect(stats120.refreshMs).toBeCloseTo(8.3, 1);
    expect(stats120.droppedCount).toBe(1);
    expect(stats120.intervals[5].dropped).toBe(true);
  });

  it('flags fewer than 10 frames as insufficient', () => {
    const stats = computeFrameStats(FRAME_BUDGET_TRACE_SHORT.frames);
    expect(stats.sufficient).toBe(false);
    expect(stats.refreshMs).toBeNull();
    expect(stats.intervals).toEqual([]);
  });
});
