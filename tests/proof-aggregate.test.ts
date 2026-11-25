import { describe, expect, it } from 'vitest';
import { mergeExperimentReports, sortKeysDeep } from '../scripts/proof/aggregate-results';
import type { ExperimentBundleIndexEntry } from '../src/lib/proof/experiment-schema';
import {
  emptyProofResults,
  type CaseResult,
  type ExperimentRunReport,
  type ProofResults,
} from '../src/lib/proof/results-schema';

function makeCase(status: CaseResult['status']): CaseResult {
  return {
    status,
    observed: { treatment: 1, control: 0 },
    presented: null,
    error: null,
  };
}

function makeReport(overrides: Partial<ExperimentRunReport>): ExperimentRunReport {
  return {
    schemaVersion: 1,
    kind: 'experiments',
    generatedAt: '2026-12-01T02:00:00.000Z',
    runner: { playwright: '1.65.1', node: 'v24.0.0', os: 'linux', react: null },
    engines: {},
    shard: null,
    experiments: {},
    ...overrides,
  };
}

describe('aggregate-results helpers', () => {
  it('merges shards, overwrites per engine, merges engine versions, and prunes removed experiments/keys', () => {
    const previous: ProofResults = {
      ...emptyProofResults(),
      engines: { chromium: '140.0', firefox: '140.0' },
      experiments: {
        'exp-a': {
          k1: { chromium: makeCase('fail'), firefox: makeCase('pass') },
          'removed-key': { chromium: makeCase('pass') },
        },
        'removed-exp': {
          k1: { chromium: makeCase('pass') },
        },
      },
      experimentMeta: {
        'exp-a': {
          sourceHash: 'a'.repeat(64),
          runtimeVersion: '1',
          vacuity: {
            firefox: { ok: true, checks: { differs: true, mutationChanges: true, blankDiffers: true }, detail: null },
          },
          checkedAt: '2026-11-30T02:00:00.000Z',
        },
        'removed-exp': {
          sourceHash: 'b'.repeat(64),
          runtimeVersion: '1',
          vacuity: {},
          checkedAt: '2026-11-30T02:00:00.000Z',
        },
      },
    };

    const shard1 = makeReport({
      generatedAt: '2026-12-01T02:00:00.000Z',
      shard: { index: 1, total: 2 },
      engines: { chromium: '143.0' },
      experiments: {
        'exp-a': {
          sourceHash: 'a'.repeat(64),
          runtimeVersion: '1',
          durationMs: 120,
          vacuity: {
            chromium: { ok: true, checks: { differs: true, mutationChanges: true, blankDiffers: true }, detail: null },
          },
          cases: { k1: { chromium: makeCase('pass') } },
        },
      },
    });

    const shard2 = makeReport({
      generatedAt: '2026-12-01T02:05:00.000Z',
      shard: { index: 2, total: 2 },
      engines: { webkit: '26.0' },
      experiments: {
        'exp-b': {
          sourceHash: 'c'.repeat(64),
          runtimeVersion: '1',
          durationMs: 90,
          vacuity: {
            webkit: { ok: true, checks: { differs: true, mutationChanges: true, blankDiffers: true }, detail: null },
          },
          cases: { k1: { webkit: makeCase('pass') } },
        },
      },
    });

    const index: ExperimentBundleIndexEntry[] = [
      { id: 'exp-a', title: 'A', kind: 'fixture', sourceHash: 'a'.repeat(64), host: 'opaque', liveInBrowser: true },
      { id: 'exp-b', title: 'B', kind: 'fixture', sourceHash: 'c'.repeat(64), host: 'opaque', liveInBrowser: true },
    ];
    const expectKeys = new Map<string, Set<string>>([
      ['exp-a', new Set(['k1'])],
      ['exp-b', new Set(['k1'])],
    ]);

    const merged = mergeExperimentReports(previous, [shard2, shard1], index, expectKeys);

    expect(merged.engines).toEqual({ chromium: '143.0', firefox: '140.0', webkit: '26.0' });
    expect(merged.experiments['removed-exp']).toBeUndefined();
    expect(merged.experimentMeta['removed-exp']).toBeUndefined();
    expect(merged.experiments['exp-a']['removed-key']).toBeUndefined();
    expect(merged.experiments['exp-a'].k1.chromium?.status).toBe('pass');
    expect(merged.experiments['exp-a'].k1.firefox?.status).toBe('pass');
    expect(merged.experiments['exp-b'].k1.webkit?.status).toBe('pass');
    expect(Object.keys(merged.experimentMeta['exp-a'].vacuity).sort()).toEqual([
      'chromium',
      'firefox',
    ]);
  });

  it('sortKeysDeep produces identical JSON regardless of input key order', () => {
    const a = { z: 1, a: { d: 4, b: 2, c: [{ y: 1, x: 2 }] } };
    const b = { a: { c: [{ x: 2, y: 1 }], b: 2, d: 4 }, z: 1 };
    expect(JSON.stringify(sortKeysDeep(a))).toBe(JSON.stringify(sortKeysDeep(b)));
  });
});
