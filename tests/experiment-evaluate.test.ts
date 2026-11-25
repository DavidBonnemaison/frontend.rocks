import { describe, expect, it } from 'vitest';
import { ExperimentBundleSchema, type ExperimentBundle } from '@/lib/proof/experiment-schema';
import { evaluateCase, notRunnableReason, type Executor } from '@/lib/proof/runtime';

function makeBundle(overrides: Record<string, unknown> = {}): ExperimentBundle {
  return ExperimentBundleSchema.parse({
    schemaVersion: 1,
    runtimeVersion: '1',
    sourceHash: 'c'.repeat(64),
    id: 'eval-demo',
    title: 'Evaluate demo experiment',
    question: 'Does evaluateCase compare treatment and control reliably?',
    kind: 'fixture',
    fixture: { html: '<div id="x"></div>' },
    variants: {
      treatment: { label: 'Treatment', css: '#x { color: red; }' },
      control: { label: 'Control' },
    },
    mutation: { variant: 'treatment', remove: 'color: red;' },
    observeSource: '(ctx) => ({ ok: Boolean(ctx.doc.body) })',
    expect: {
      'case-a': {
        treatment: { b: 2, a: 1 },
        control: { a: 0, b: 0 },
      },
    },
    liveInBrowser: true,
    ...overrides,
  });
}

describe('evaluateCase', () => {
  it('returns pass when treatment and control match canonical JSON and preserves presented and meta.expectKey', async () => {
    const bundle = makeBundle();
    const seenMeta: Array<string | null> = [];
    const exec: Executor = async (variant, _params, _mutated, meta) => {
      seenMeta.push(meta.expectKey);
      if (variant === 'treatment') {
        return { ok: true, value: { a: 1, b: 2 }, presented: { frameMs: 12 }, trace: [], console: [] };
      }
      return { ok: true, value: { b: 0, a: 0 }, presented: { frameMs: 4 }, trace: [], console: [] };
    };

    const res = await evaluateCase(bundle, 'case-a', exec);
    expect(res.status).toBe('pass');
    expect(res.error).toBeNull();
    expect(res.observed).toEqual({ treatment: { a: 1, b: 2 }, control: { b: 0, a: 0 } });
    expect(res.presented).toEqual({ treatment: { frameMs: 12 }, control: { frameMs: 4 } });
    expect(seenMeta).toEqual(['case-a', 'case-a']);
  });

  it('returns fail when one variant differs from expected value', async () => {
    const bundle = makeBundle();
    const exec: Executor = async (variant) => {
      if (variant === 'treatment') {
        return { ok: true, value: { a: 99, b: 2 }, presented: null, trace: [], console: [] };
      }
      return { ok: true, value: { a: 0, b: 0 }, presented: null, trace: [], console: [] };
    };

    const res = await evaluateCase(bundle, 'case-a', exec);
    expect(res.status).toBe('fail');
    expect(res.error).toBeNull();
  });

  it('returns error prefixed with treatment: when treatment throws', async () => {
    const bundle = makeBundle();
    const exec: Executor = async (variant) => {
      if (variant === 'treatment') {
        return { ok: false, error: 'FR_RAF_THROTTLED', trace: [], console: [] };
      }
      return { ok: true, value: { a: 0, b: 0 }, presented: null, trace: [], console: [] };
    };

    const res = await evaluateCase(bundle, 'case-a', exec);
    expect(res.status).toBe('error');
    expect(res.error).toBe('treatment: FR_RAF_THROTTLED');
    expect(res.observed.treatment).toBeNull();
  });
});

describe('notRunnableReason', () => {
  it('returns null for a runnable browser experiment', () => {
    expect(notRunnableReason(makeBundle())).toBeNull();
  });

  it('identifies measured, input, emulation, network-server, and engine-console reasons', () => {
    expect(
      notRunnableReason(
        makeBundle({
          kind: 'measured',
          measured: { repeat: 20, metric: 'layout-ms', minRatio: 2 },
        })
      )
    ).toBe('measured');

    expect(
      notRunnableReason(
        makeBundle({
          variants: {
            treatment: { label: 'T', css: '#x { color: red; }', input: [{ action: 'click', selector: '#x' }] },
            control: { label: 'C' },
          },
        })
      )
    ).toBe('input');

    expect(
      notRunnableReason(
        makeBundle({
          expect: {
            'case-a': {
              emulation: { reducedMotion: 'reduce' },
              treatment: { a: 1 },
              control: { a: 0 },
            },
          },
        })
      )
    ).toBe('emulation');

    expect(
      notRunnableReason(
        makeBundle({
          kind: 'network',
          network: {
            mode: 'server',
            routes: [{ id: 'r1', origin: 'self', method: 'GET', path: '/a', status: 200 }],
          },
        })
      )
    ).toBe('network-server');

    expect(
      notRunnableReason(makeBundle({ kind: 'console', consoleSource: 'engine' }))
    ).toBe('engine-console');
  });
});
