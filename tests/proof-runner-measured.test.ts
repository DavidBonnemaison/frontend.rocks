import { describe, expect, it } from 'vitest';
import { runMeasured } from '../scripts/proof/runner-core';
import type { ExperimentBundle } from '../src/lib/proof/experiment-schema';
import type { Executor } from '../src/lib/proof/runtime/evaluate';
import type { RunResult } from '../src/lib/proof/runtime/protocol';

function makeMeasuredBundle(overrides?: Partial<ExperimentBundle>): ExperimentBundle {
  return {
    schemaVersion: 1,
    runtimeVersion: '1',
    sourceHash: 'a'.repeat(64),
    id: 'measured-test',
    title: 'Measured test fixture',
    question: 'Does treatment take at least 2x longer than control?',
    kind: 'measured',
    fixture: { html: '<div />' },
    params: {},
    variants: {
      treatment: { label: 'Expensive', js: 'window.__slow = true;' },
      control: { label: 'Cheap' },
    },
    mutation: { variant: 'treatment', remove: 'window.__slow = true;' },
    observeSource: '(ctx) => 1',
    expect: {
      'main-case': { treatment: null, control: null },
    },
    measured: { repeat: 15, metric: 'duration (ms)', minRatio: 2 },
    viewport: { width: 1280, height: 800 },
    consoleSource: 'page',
    host: 'opaque',
    liveInBrowser: false,
    ...overrides,
  };
}

const okNum = (value: number): RunResult => ({
  ok: true,
  value,
  presented: null,
  trace: [],
  console: [],
});

describe('runMeasured', () => {
  it('passes when treatment is ~5x slower than control with statistical significance', async () => {
    let tIdx = 0;
    let cIdx = 0;
    const tNoise = [-0.2, 0.1, 0.3, -0.1, 0.2, 0, -0.3, 0.15, -0.05, 0.25, -0.15, 0.05, 0.1, -0.1, 0.2];
    const cNoise = [0.05, -0.05, 0.1, -0.1, 0.02, -0.02, 0.08, -0.08, 0.03, -0.03, 0.06, -0.06, 0.01, -0.01, 0.04];

    const exec: Executor = async (variant, _params, mutated) => {
      if (variant === 'blank') return { ok: false, error: 'missing workload', trace: [], console: [] };
      if (variant === 'treatment' && !mutated) return okNum(10 + tNoise[tIdx++ % tNoise.length]);
      return okNum(2 + cNoise[cIdx++ % cNoise.length]);
    };

    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.vacuity.ok).toBe(true);
    expect(outcome.vacuity.checks).toEqual({
      differs: null,
      mutationChanges: true,
      blankDiffers: true,
    });
    const res = outcome.cases['main-case'];
    expect(res.status).toBe('pass');
    expect(res.presented).toBeNull();
    const obs = res.observed as { ratio: number; pValue: number };
    expect(obs.ratio).toBeGreaterThan(4.5);
    expect(obs.ratio).toBeLessThan(5.5);
    expect(obs.pValue).toBeLessThan(0.01);
  });

  it('fails when treatment is faster than control (inverted orientation)', async () => {
    const exec: Executor = async (variant, _params, mutated) => {
      if (variant === 'blank') return { ok: false, error: 'err', trace: [], console: [] };
      if (variant === 'treatment' && !mutated) return okNum(2);
      return okNum(10);
    };
    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.cases['main-case'].status).toBe('fail');
  });

  it('fails when treatment and control have equal durations', async () => {
    const exec: Executor = async (variant) => {
      if (variant === 'blank') return { ok: false, error: 'err', trace: [], console: [] };
      return okNum(5);
    };
    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.cases['main-case'].status).toBe('fail');
  });

  it('returns FR_MEASURE_TOO_SMALL error when control median is below 1 ms', async () => {
    const exec: Executor = async (variant) => {
      if (variant === 'blank') return { ok: false, error: 'err', trace: [], console: [] };
      return okNum(variant === 'treatment' ? 3 : 0.3);
    };
    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.cases['main-case'].status).toBe('error');
    expect(outcome.cases['main-case'].error).toContain('FR_MEASURE_TOO_SMALL');
  });

  it('returns error when observe returns a string instead of a number', async () => {
    const exec: Executor = async () => ({
      ok: true,
      value: 'not-a-number',
      presented: null,
      trace: [],
      console: [],
    });
    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.cases['main-case'].status).toBe('error');
  });

  it('marks vacuous when mutated treatment still shows the same effect', async () => {
    const exec: Executor = async (variant) => {
      if (variant === 'blank') return { ok: false, error: 'err', trace: [], console: [] };
      // Both unmutated and mutated treatment return 10ms while control returns 2ms.
      return okNum(variant === 'treatment' ? 10 : 2);
    };
    const outcome = await runMeasured(makeMeasuredBundle(), exec);
    expect(outcome.vacuity.ok).toBe(false);
    expect(outcome.vacuity.checks.mutationChanges).toBe(false);
    expect(outcome.cases['main-case'].status).toBe('vacuous');
  });

  it('alternates treatment and control order across repetitions', async () => {
    const calls: string[] = [];
    const exec: Executor = async (variant, _params, mutated) => {
      if (variant === 'blank') return { ok: false, error: 'err', trace: [], console: [] };
      if (!mutated) calls.push(variant);
      if (variant === 'treatment' && !mutated) return okNum(10);
      return okNum(2);
    };
    await runMeasured(makeMeasuredBundle(), exec);
    // First 30 calls belong to the main measurement (15 pairs).
    const mainPairs = calls.slice(0, 30);
    for (let i = 0; i < 15; i++) {
      const pair = [mainPairs[2 * i], mainPairs[2 * i + 1]];
      expect(pair).toEqual(i % 2 === 0 ? ['treatment', 'control'] : ['control', 'treatment']);
    }
  });
});
