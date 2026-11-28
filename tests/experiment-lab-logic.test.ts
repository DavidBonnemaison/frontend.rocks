import { describe, expect, it } from 'vitest';
import {
  buildControlsList,
  canTryItYourself,
  checkLiveAgainstExpect,
  computeLabPresentation,
  computeLabStatus,
  extractRecordedObservation,
  extractRecordedResults,
  findMatchingExpect,
  formatLiveBrowserCaption,
  formatRecordedCaption,
  getDefaultParams,
  isRecordedOnly,
  isStaleRunToken,
  selectRecordedCase,
  summarizeEngineStatuses,
} from '@/components/experiments/logic';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import { emptyProofResults, type ProofResults } from '@/lib/proof/results-schema';

function makeBundle(overrides: Partial<ExperimentBundle> = {}): ExperimentBundle {
  return {
    schemaVersion: 1,
    id: 'container-query-inline-size',
    title: 'Container query width',
    question: 'Does the card switch to two columns?',
    kind: 'fixture',
    fixture: { html: '<div />' },
    params: {
      w: { kind: 'range', label: 'Slot width', min: 220, max: 640, step: 20, default: 480, unit: 'px' },
      dense: { kind: 'toggle', label: 'Dense', default: false },
      mode: { kind: 'select', label: 'Mode', options: ['a', 'b'], default: 'a' },
    },
    variants: {
      treatment: { label: 'With container', css: '.slot { container-type: inline-size; }' },
      control: { label: 'Without container' },
    },
    mutation: { variant: 'treatment', remove: 'container-type: inline-size;' },
    observeSource: '(ctx) => ({ columns: 2 })',
    expect: {
      'two-columns-at-480': {
        params: { w: 480 },
        treatment: { columns: 2 },
        control: { columns: 1 },
      },
      'one-column-at-300': {
        params: { w: 300 },
        treatment: { columns: 1 },
        control: { columns: 1 },
      },
    },
    viewport: { width: 1280, height: 800 },
    host: 'opaque',
    consoleSource: 'page',
    vendor: [],
    liveInBrowser: true,
    sourceHash: 'abc123',
    runtimeVersion: '1',
    ...overrides,
  };
}

function makeProofResults(): ProofResults {
  return {
    ...emptyProofResults(),
    generatedAt: '2026-12-01T02:41:44Z',
    engines: {
      chromium: '143.0.7499.4',
      firefox: '145.0',
      webkit: '26.0',
    },
    experiments: {
      'container-query-inline-size': {
        'two-columns-at-480': {
          chromium: {
            status: 'pass',
            observed: { treatment: { columns: 2 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
          firefox: {
            status: 'pass',
            observed: { treatment: { columns: 2 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
          webkit: {
            status: 'fail',
            observed: { treatment: { columns: 1 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
        },
        'one-column-at-300': {
          chromium: {
            status: 'pass',
            observed: { treatment: { columns: 1 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
          firefox: {
            status: 'pass',
            observed: { treatment: { columns: 1 }, control: { columns: 1 } },
            presented: null,
            error: null,
          },
          webkit: {
            status: 'error',
            observed: { treatment: null, control: null },
            presented: null,
            error: 'timeout',
          },
        },
      },
    },
  };
}

describe('ExperimentLab pure logic', () => {
  it('generates controls list and default params from bundle.params', () => {
    const bundle = makeBundle();
    const controls = buildControlsList(bundle);
    expect(controls.map((c) => [c.name, c.def.kind])).toEqual([
      ['w', 'range'],
      ['dense', 'toggle'],
      ['mode', 'select'],
    ]);
    expect(getDefaultParams(bundle)).toEqual({ w: 480, dense: false, mode: 'a' });
    expect(getDefaultParams(bundle, { w: 300 })).toEqual({ w: 300, dense: false, mode: 'a' });
  });

  it('extracts recorded results and selects default case preferring chromium', () => {
    const bundle = makeBundle();
    const recorded = extractRecordedResults(bundle.id, makeProofResults());
    expect(recorded).not.toBeNull();
    const selected = selectRecordedCase(bundle, recorded, { w: 480, dense: false, mode: 'a' });
    expect(selected?.expectKey).toBe('two-columns-at-480');
    expect(selected?.engine).toBe('chromium');

    const ff = selectRecordedCase(bundle, recorded, { w: 480, dense: false, mode: 'a' }, 'firefox');
    expect(ff?.engine).toBe('firefox');
  });

  it('matches current params against expect cases and compares live observations', () => {
    const bundle = makeBundle();
    expect(findMatchingExpect(bundle, { w: 480, dense: false, mode: 'a' })?.key).toBe(
      'two-columns-at-480',
    );
    expect(findMatchingExpect(bundle, { w: 360, dense: false, mode: 'a' })).toBeNull();

    expect(
      checkLiveAgainstExpect(bundle, { w: 480, dense: false, mode: 'a' }, 'treatment', {
        columns: 2,
      }),
    ).toBe('matches');
    expect(
      checkLiveAgainstExpect(bundle, { w: 480, dense: false, mode: 'a' }, 'treatment', {
        columns: 1,
      }),
    ).toBe('differs');
    expect(
      checkLiveAgainstExpect(bundle, { w: 360, dense: false, mode: 'a' }, 'treatment', {
        columns: 1,
      }),
    ).toBeNull();
  });

  it('detects stale run tokens', () => {
    expect(isStaleRunToken(3, 2)).toBe(true);
    expect(isStaleRunToken(3, 3)).toBe(false);
    expect(isStaleRunToken(3, 4)).toBe(false);
  });

  it('identifies recorded-only bundles and Try it yourself eligibility', () => {
    const live = makeBundle({ liveInBrowser: true });
    expect(isRecordedOnly(live)).toBe(false);
    expect(canTryItYourself(live)).toBe(false);

    const measured = makeBundle({ kind: 'measured', liveInBrowser: false });
    expect(isRecordedOnly(measured)).toBe(true);
    expect(canTryItYourself(measured)).toBe(false);

    const withEmulation = makeBundle({
      liveInBrowser: false,
      expect: {
        dpr2: {
          emulation: { deviceScaleFactor: 2 },
          treatment: { dpr: 2 },
          control: { dpr: 1 },
        },
      },
    });
    expect(isRecordedOnly(withEmulation)).toBe(true);
    expect(canTryItYourself(withEmulation)).toBe(true);
  });

  it('computes mode, labels, and highlightColor for explore vs repro', () => {
    const bundle = makeBundle();
    expect(computeLabPresentation(bundle, { pieceColor: 'vermilion' })).toEqual({
      mode: 'explore',
      labels: { treatment: 'With container', control: 'Without container' },
      highlightColor: 'var(--piece-vermilion)',
    });
    expect(
      computeLabPresentation(bundle, {
        reproExperimentId: 'container-query-inline-size',
        pieceColor: 'cobalt',
      }),
    ).toEqual({
      mode: 'repro',
      labels: { treatment: 'As shipped', control: 'With the fix' },
      highlightColor: 'var(--piece-cobalt)',
    });
  });

  it('summarizes lab status and per-engine status symbols', () => {
    const bundle = makeBundle();
    const recorded = extractRecordedResults(bundle.id, makeProofResults());
    expect(computeLabStatus(bundle, recorded)).toBe('diverges');
    expect(computeLabStatus(bundle, null)).toBe('pending');

    const rows = summarizeEngineStatuses(bundle, recorded);
    expect(rows).toEqual([
      { engine: 'chromium', label: 'Chromium', version: '143.0.7499.4', status: 'pass', symbol: '✓' },
      { engine: 'firefox', label: 'Firefox', version: '145.0', status: 'pass', symbol: '✓' },
      { engine: 'webkit', label: 'WebKit', version: '26.0', status: 'fail', symbol: '✕' },
    ]);
  });

  it('formats nightly and live browser captions', () => {
    expect(formatRecordedCaption('chromium', '143.0.7499.4', '2026-12-01T02:41:44Z')).toBe(
      'Recorded by the nightly run · Chromium 143.0 · 2026-12-01',
    );
    expect(formatLiveBrowserCaption('Mozilla/5.0 Gecko/20100101 Firefox/146.0')).toBe(
      'Recorded in your browser · Firefox 146.0',
    );
  });

  it('extracts standard and measured recorded observations', () => {
    const measuredObs = extractRecordedObservation(
      {
        status: 'pass',
        observed: {
          treatment: { median: 20, n: 15 },
          control: { median: 4, n: 15 },
          ratio: 5,
          pValue: 0.001,
        },
        presented: null,
      },
      'treatment',
    );
    expect(measuredObs.measured?.ratio).toBe(5);
    expect(measuredObs.observed).toBeUndefined();
  });
});
