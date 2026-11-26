import { describe, expect, it } from 'vitest';
import { selectPath } from '@/lib/proof/select-path';
import { stepperReducer, type StepperState } from '@/components/instruments/useStepper';

describe('selectPath', () => {
  const sample = {
    events: [
      { seq: 0, label: 'script' },
      { seq: 1, label: 'promise.then #1' },
    ],
    probe: { hitId: 'header', nested: null },
    count: 2,
  };

  it('returns root when path is empty string', () => {
    expect(selectPath(sample, '')).toEqual({ ok: true, value: sample });
  });

  it('resolves nested object properties and numeric array indices', () => {
    expect(selectPath(sample, 'probe.hitId')).toEqual({ ok: true, value: 'header' });
    expect(selectPath(sample, 'events.1.label')).toEqual({ ok: true, value: 'promise.then #1' });
    expect(selectPath(sample, 'probe.nested')).toEqual({ ok: true, value: null });
    expect(selectPath(sample, 'count')).toEqual({ ok: true, value: 2 });
  });

  it('reports the failing path for missing keys, out-of-bounds indices, and non-containers', () => {
    expect(selectPath(sample, 'probe.missing')).toEqual({ ok: false, at: 'probe.missing' });
    expect(selectPath(sample, 'events.5.label')).toEqual({ ok: false, at: 'events.5' });
    expect(selectPath(sample, 'events.foo')).toEqual({ ok: false, at: 'events.foo' });
    expect(selectPath(sample, 'probe.nested.x')).toEqual({ ok: false, at: 'probe.nested.x' });
    expect(selectPath(sample, 'count.x')).toEqual({ ok: false, at: 'count.x' });
  });
});

describe('stepperReducer', () => {
  const base: StepperState = { index: 1, count: 4, playing: false };

  it('handles next, prev, home, end, and goto with clamping', () => {
    expect(stepperReducer(base, { type: 'next' })).toEqual({ index: 2, count: 4, playing: false });
    expect(stepperReducer({ index: 3, count: 4, playing: false }, { type: 'next' }).index).toBe(3);
    expect(stepperReducer(base, { type: 'prev' }).index).toBe(0);
    expect(stepperReducer({ index: 0, count: 4, playing: false }, { type: 'prev' }).index).toBe(0);
    expect(stepperReducer({ index: 3, count: 4, playing: true }, { type: 'home' })).toEqual({
      index: 0,
      count: 4,
      playing: false,
    });
    expect(stepperReducer(base, { type: 'end' })).toEqual({ index: 3, count: 4, playing: false });
    expect(stepperReducer(base, { type: 'goto', index: 99 }).index).toBe(3);
    expect(stepperReducer(base, { type: 'goto', index: -5 }).index).toBe(0);
  });

  it('disables autoplay when reducedMotion is true', () => {
    const res = stepperReducer(base, { type: 'play', reducedMotion: true });
    expect(res.playing).toBe(false);
    expect(res.index).toBe(1);
  });

  it('advances on tick while playing and stops at the last step', () => {
    let s = stepperReducer({ index: 2, count: 4, playing: false }, { type: 'play', reducedMotion: false });
    expect(s).toEqual({ index: 2, count: 4, playing: true });

    s = stepperReducer(s, { type: 'tick' });
    expect(s).toEqual({ index: 3, count: 4, playing: true });

    s = stepperReducer(s, { type: 'tick' });
    expect(s).toEqual({ index: 3, count: 4, playing: false });
  });

  it('restarts from 0 when play is pressed on the last step', () => {
    const s = stepperReducer({ index: 3, count: 4, playing: false }, { type: 'play', reducedMotion: false });
    expect(s).toEqual({ index: 0, count: 4, playing: true });
  });
});
