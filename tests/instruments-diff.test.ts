import { describe, expect, it } from 'vitest';
import {
  diffJson,
  flattenJsonLeaves,
  shouldUseReadoutMode,
} from '@/components/instruments/diff-view/diff';
import { DiffObservedSchema } from '@/components/instruments/diff-view/schema';
import {
  DIFF_VIEW_OBJECT_PRIMARY,
  DIFF_VIEW_OBJECT_SECONDARY,
  DIFF_VIEW_READOUT_PRIMARY,
  DIFF_VIEW_READOUT_SECONDARY,
} from '@/components/instruments/__fixtures__/diff-view';

describe('DiffView utilities', () => {
  it('validates fixtures and diffs nested objects and arrays of different lengths', () => {
    expect(DiffObservedSchema.safeParse(DIFF_VIEW_OBJECT_PRIMARY).success).toBe(true);
    const entries = diffJson(DIFF_VIEW_OBJECT_PRIMARY, DIFF_VIEW_OBJECT_SECONDARY);

    expect(entries.find((e) => e.path === 'matched')).toEqual({
      path: 'matched',
      kind: 'changed',
      a: true,
      b: false,
    });
    expect(entries.find((e) => e.path === 'computed.display')?.kind).toBe('same');
    expect(entries.find((e) => e.path === 'tags.1')).toEqual({
      path: 'tags.1',
      kind: 'removed',
      a: 'wide',
    });
  });

  it('distinguishes null from absent keys and compares floats strictly', () => {
    const entries = diffJson(
      { a: null, b: 0.1 + 0.2 },
      { b: 0.3 },
    );
    expect(entries.find((e) => e.path === 'a')).toEqual({
      path: 'a',
      kind: 'removed',
      a: null,
    });
    expect(entries.find((e) => e.path === 'b')?.kind).toBe('changed');
  });

  it('selects Readout mode only for 1 to 3 numeric leaves', () => {
    const numericPair = diffJson(DIFF_VIEW_READOUT_PRIMARY, DIFF_VIEW_READOUT_SECONDARY);
    expect(shouldUseReadoutMode(numericPair)).toBe(true);

    const singleNumeric = flattenJsonLeaves({ columns: 2, rows: 1, gap: 16 });
    expect(shouldUseReadoutMode(singleNumeric)).toBe(true);

    const fourNumeric = flattenJsonLeaves({ a: 1, b: 2, c: 3, d: 4 });
    expect(shouldUseReadoutMode(fourNumeric)).toBe(false);

    const mixed = diffJson(DIFF_VIEW_OBJECT_PRIMARY, DIFF_VIEW_OBJECT_SECONDARY);
    expect(shouldUseReadoutMode(mixed)).toBe(false);
  });
});
