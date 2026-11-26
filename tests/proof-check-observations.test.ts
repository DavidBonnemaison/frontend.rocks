import { describe, expect, it } from 'vitest';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';
import { ExperimentViewSchema } from '@/lib/proof/view-schema';
import { checkObservations } from '../scripts/proof/check-observations';

function makeResults(overrides?: Partial<ProofResults>): ProofResults {
  return {
    ...emptyProofResults(),
    ...overrides,
  };
}

describe('checkObservations', () => {
  const queueView = ExperimentViewSchema.parse({
    instrument: 'queue-view',
    observedPath: '',
  });

  it('returns no violations when passing observations conform to observedSchema', () => {
    const results = makeResults({
      experiments: {
        'event-loop': {
          order: {
            chromium: {
              status: 'pass',
              observed: {
                treatment: {
                  events: [{ seq: 0, op: 'render', queue: 'render', label: 'render' }],
                },
                control: {
                  events: [{ seq: 0, op: 'render', queue: 'render', label: 'render' }],
                },
              },
              presented: null,
              error: null,
            },
          },
        },
      },
      experimentMeta: {
        'event-loop': {
          sourceHash: 'hash-v1',
          runtimeVersion: '1',
          vacuity: {},
          checkedAt: '2026-11-26T00:00:00Z',
        },
      },
    });

    const violations = checkObservations({
      results,
      views: new Map([['event-loop', queueView]]),
      bundleHashes: new Map([['event-loop', 'hash-v1']]),
    });
    expect(violations).toEqual([]);
  });

  it('reports a violation when observed.treatment does not match observedSchema', () => {
    const results = makeResults({
      experiments: {
        'event-loop': {
          order: {
            firefox: {
              status: 'pass',
              observed: {
                treatment: {
                  events: [{ seq: -1, op: 'invalid-op', queue: 'task', label: 'x' }],
                },
                control: { events: [] },
              },
              presented: null,
              error: null,
            },
          },
        },
      },
      experimentMeta: {
        'event-loop': {
          sourceHash: 'hash-v1',
          runtimeVersion: '1',
          vacuity: {},
          checkedAt: '2026-11-26T00:00:00Z',
        },
      },
    });

    const violations = checkObservations({
      results,
      views: new Map([['event-loop', queueView]]),
      bundleHashes: new Map([['event-loop', 'hash-v1']]),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      experimentId: 'event-loop',
      expectKey: 'order',
      engine: 'firefox',
    });
  });

  it('ignores stale results whose recorded sourceHash differs from current bundle sourceHash', () => {
    const results = makeResults({
      experiments: {
        'event-loop': {
          order: {
            chromium: {
              status: 'pass',
              observed: {
                treatment: { wrongShape: true },
                control: { wrongShape: false },
              },
              presented: null,
              error: null,
            },
          },
        },
      },
      experimentMeta: {
        'event-loop': {
          sourceHash: 'hash-yesterday',
          runtimeVersion: '1',
          vacuity: {},
          checkedAt: '2026-11-25T00:00:00Z',
        },
      },
    });

    const violations = checkObservations({
      results,
      views: new Map([['event-loop', queueView]]),
      bundleHashes: new Map([['event-loop', 'hash-today']]),
    });
    expect(violations).toEqual([]);
  });

  it('rejects an extra timestamp field t in observed.treatment', () => {
    const results = makeResults({
      experiments: {
        'event-loop': {
          order: {
            chromium: {
              status: 'pass',
              observed: {
                treatment: {
                  events: [{ seq: 0, t: 12.4, op: 'render', queue: 'render', label: 'render' }],
                },
                control: {
                  events: [{ seq: 0, op: 'render', queue: 'render', label: 'render' }],
                },
              },
              presented: null,
              error: null,
            },
          },
        },
      },
      experimentMeta: {
        'event-loop': {
          sourceHash: 'hash-v1',
          runtimeVersion: '1',
          vacuity: {},
          checkedAt: '2026-11-26T00:00:00Z',
        },
      },
    });

    const violations = checkObservations({
      results,
      views: new Map([['event-loop', queueView]]),
      bundleHashes: new Map([['event-loop', 'hash-v1']]),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].experimentId).toBe('event-loop');
  });

  it('returns no violations when an experiment has no recorded results yet', () => {
    const violations = checkObservations({
      results: makeResults(),
      views: new Map([['event-loop', queueView]]),
      bundleHashes: new Map([['event-loop', 'hash-v1']]),
    });
    expect(violations).toEqual([]);
  });
});
