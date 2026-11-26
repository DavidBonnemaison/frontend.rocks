import { describe, expect, it } from 'vitest';
import { ExperimentViewSchema } from '@/lib/proof/view-schema';
import { validateExperimentView } from '@/lib/validators/experiment-view-validator';

describe('ExperimentViewSchema and static view validation', () => {
  it('applies defaults and rejects unknown fields', () => {
    const parsed = ExperimentViewSchema.parse({ instrument: 'queue-view' });
    expect(parsed).toEqual({
      instrument: 'queue-view',
      observedPath: '',
      tracePath: null,
      presentedPath: null,
      compare: 'side-by-side',
      smoke: false,
    });

    expect(
      ExperimentViewSchema.safeParse({ instrument: 'queue-view', liveInBrowser: true }).success,
    ).toBe(false);
    expect(ExperimentViewSchema.safeParse({ instrument: 'unknown-inst' }).success).toBe(false);
  });

  it('rejects observedPath that does not exist in declared expect.treatment', () => {
    const res = validateExperimentView(
      'event-loop-demo',
      { instrument: 'queue-view', observedPath: 'missing.events' },
      {
        kind: 'trace',
        expect: {
          order: {
            treatment: { events: [{ seq: 0, op: 'render', queue: 'render', label: 'render' }] },
            control: { events: [{ seq: 0, op: 'render', queue: 'render', label: 'render' }] },
          },
        },
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0].experimentId).toBe('event-loop-demo');
      expect(res.errors[0].message).toContain('missing.events');
    }
  });

  it('enforces kind: measured for frame-budget', () => {
    const bad = validateExperimentView(
      'not-measured',
      { instrument: 'frame-budget' },
      {
        kind: 'fixture',
        expect: { a: { treatment: { x: 1 }, control: { x: 0 } } },
      },
    );
    expect(bad.ok).toBe(false);

    const good = validateExperimentView(
      'layout-thrash',
      { instrument: 'frame-budget' },
      {
        kind: 'measured',
        expect: { a: { treatment: { x: 1 }, control: { x: 0 } } },
      },
    );
    expect(good.ok).toBe(true);
  });
});
