import { describe, expect, it } from 'vitest';
import {
  computeLiveInBrowser,
  ExperimentBundleSchema,
  type ExperimentBundle,
} from '@/lib/proof/experiment-schema';

function validBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runtimeVersion: '1',
    sourceHash: 'a'.repeat(64),
    id: 'container-query-inline-size',
    title: '@container reads the container width',
    question: 'Does the card switch to two columns when its container widens?',
    kind: 'fixture',
    fixture: {
      html: '<div class="slot"><article class="card"></article></div>',
      css: '.slot { width: var(--w); }',
    },
    params: {
      w: { kind: 'range', label: 'Slot width', min: 220, max: 640, step: 20, default: 480, unit: 'px' },
    },
    variants: {
      treatment: { label: 'With container-type', css: '.slot { container-type: inline-size; }' },
      control: { label: 'Without container-type' },
    },
    mutation: { variant: 'treatment', remove: 'container-type: inline-size;' },
    observeSource: '(ctx) => ({ columns: 2 })',
    expect: {
      'two-columns-at-480': {
        params: { w: 480 },
        treatment: { columns: 2 },
        control: { columns: 1 },
      },
    },
    liveInBrowser: true,
    ...overrides,
  };
}

describe('ExperimentBundleSchema', () => {
  it('accepts a valid bundle and fills default viewport, consoleSource, and host', () => {
    const parsed = ExperimentBundleSchema.parse(validBundle());
    expect(parsed.viewport).toEqual({ width: 1280, height: 800 });
    expect(parsed.consoleSource).toBe('page');
    expect(parsed.host).toBe('opaque');
    expect(parsed.liveInBrowser).toBe(true);
  });

  it('rejects a question without a trailing question mark', () => {
    const res = ExperimentBundleSchema.safeParse(
      validBundle({ question: 'Does the card switch to two columns' })
    );
    expect(res.success).toBe(false);
  });

  it('rejects out-of-bounds range defaults and capitalized parameter names', () => {
    const outOfRange = ExperimentBundleSchema.safeParse(
      validBundle({
        params: {
          w: { kind: 'range', label: 'Slot width', min: 220, max: 640, step: 20, default: 700, unit: 'px' },
        },
      })
    );
    expect(outOfRange.success).toBe(false);

    const badName = ExperimentBundleSchema.safeParse(
      validBundle({
        params: {
          Width: { kind: 'range', label: 'Slot width', min: 220, max: 640, step: 20, default: 480, unit: 'px' },
        },
      })
    );
    expect(badName.success).toBe(false);
  });

  it('rejects select defaults outside options and invalid option strings', () => {
    const badDefault = ExperimentBundleSchema.safeParse(
      validBundle({
        params: {
          mode: { kind: 'select', label: 'Mode', options: ['auto', 'manual'], default: 'other' },
        },
      })
    );
    expect(badDefault.success).toBe(false);

    const badOption = ExperimentBundleSchema.safeParse(
      validBundle({
        params: {
          mode: { kind: 'select', label: 'Mode', options: ['a b', 'manual'], default: 'manual' },
        },
      })
    );
    expect(badOption.success).toBe(false);
  });

  it('rejects empty expect and non-kebab expect keys', () => {
    expect(ExperimentBundleSchema.safeParse(validBundle({ expect: {} })).success).toBe(false);
    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          expect: {
            TwoColumns: { treatment: { columns: 2 }, control: { columns: 1 } },
          },
        })
      ).success
    ).toBe(false);
  });

  it('rejects NaN and Infinity in expected JSON values', () => {
    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          expect: { 'case-a': { treatment: Number.NaN, control: 1 } },
        })
      ).success
    ).toBe(false);
    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          expect: { 'case-a': { treatment: Number.POSITIVE_INFINITY, control: 1 } },
        })
      ).success
    ).toBe(false);
  });

  it('rejects null-body status with body and routes without leading slash', () => {
    const nullBody = ExperimentBundleSchema.safeParse(
      validBundle({
        kind: 'network',
        network: {
          mode: 'shim',
          routes: [{ id: 'no-content', origin: 'self', method: 'GET', path: '/api', status: 204, body: 'x' }],
        },
      })
    );
    expect(nullBody.success).toBe(false);

    const noSlash = ExperimentBundleSchema.safeParse(
      validBundle({
        kind: 'network',
        network: {
          mode: 'shim',
          routes: [{ id: 'bad-path', origin: 'self', method: 'GET', path: 'api', status: 200 }],
        },
      })
    );
    expect(noSlash.success).toBe(false);
  });

  it('validates measured constraints strictly', () => {
    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          kind: 'measured',
          measured: { repeat: 10, metric: 'layout-ms', minRatio: 2 },
        })
      ).success
    ).toBe(false);

    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          kind: 'measured',
          measured: { repeat: 20, metric: 'layout-ms', minRatio: 1.1 },
        })
      ).success
    ).toBe(false);

    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          kind: 'measured',
          measured: { repeat: 20, metric: 'layout-ms', minRatio: 2, slower: true },
        })
      ).success
    ).toBe(false);
  });

  it('rejects unknown top-level keys, missing liveInBrowser, and short sourceHash', () => {
    expect(ExperimentBundleSchema.safeParse(validBundle({ extraKey: true })).success).toBe(false);

    const withoutLive = validBundle();
    delete withoutLive.liveInBrowser;
    expect(ExperimentBundleSchema.safeParse(withoutLive).success).toBe(false);

    expect(
      ExperimentBundleSchema.safeParse(validBundle({ sourceHash: 'a'.repeat(63) })).success
    ).toBe(false);
  });

  it('rejects serviceWorker with opaque host and invalid/duplicate vendor entries', () => {
    expect(
      ExperimentBundleSchema.safeParse(
        validBundle({
          host: 'opaque',
          serviceWorker: "self.addEventListener('install', () => {});",
        })
      ).success
    ).toBe(false);

    expect(
      ExperimentBundleSchema.safeParse(validBundle({ vendor: ['react', 'react'] })).success
    ).toBe(false);

    expect(
      ExperimentBundleSchema.safeParse(validBundle({ vendor: ['vue'] })).success
    ).toBe(false);
  });

  it('validates variant input steps and selector grammar', () => {
    const ok = ExperimentBundleSchema.safeParse(
      validBundle({
        variants: {
          treatment: {
            label: 'With click',
            css: '.slot { container-type: inline-size; }',
            input: [{ action: 'click', selector: '#go' }],
          },
          control: { label: 'Without click' },
        },
      })
    );
    expect(ok.success).toBe(true);

    const badSelector = ExperimentBundleSchema.safeParse(
      validBundle({
        variants: {
          treatment: {
            label: 'Bad selector',
            input: [{ action: 'click', selector: 'div > span' }],
          },
          control: { label: 'Control' },
        },
      })
    );
    expect(badSelector.success).toBe(false);

    const tooLongWait = ExperimentBundleSchema.safeParse(
      validBundle({
        variants: {
          treatment: {
            label: 'Too long wait',
            input: [{ action: 'wait', ms: 1001 }],
          },
          control: { label: 'Control' },
        },
      })
    );
    expect(tooLongWait.success).toBe(false);

    const emptyInput = ExperimentBundleSchema.safeParse(
      validBundle({
        variants: {
          treatment: { label: 'Empty input', input: [] },
          control: { label: 'Control' },
        },
      })
    );
    expect(emptyInput.success).toBe(false);
  });

  it('validates expect case emulation options', () => {
    const ok = ExperimentBundleSchema.safeParse(
      validBundle({
        expect: {
          'case-a': {
            emulation: { reducedMotion: 'reduce' },
            treatment: { columns: 2 },
            control: { columns: 1 },
          },
        },
      })
    );
    expect(ok.success).toBe(true);

    const bad = ExperimentBundleSchema.safeParse(
      validBundle({
        expect: {
          'case-a': {
            emulation: { colorScheme: 'sepia' },
            treatment: { columns: 2 },
            control: { columns: 1 },
          },
        },
      })
    );
    expect(bad.success).toBe(false);
  });
});

describe('computeLiveInBrowser', () => {
  function parseBase(overrides: Record<string, unknown> = {}): Omit<ExperimentBundle, 'liveInBrowser'> {
    const parsed = ExperimentBundleSchema.parse(validBundle(overrides));
    const { liveInBrowser: _ignored, ...rest } = parsed;
    void _ignored;
    return rest;
  }

  it('returns true for a plain fixture bundle', () => {
    expect(computeLiveInBrowser(parseBase())).toBe(true);
  });

  it('returns false when a variant defines input', () => {
    expect(
      computeLiveInBrowser(
        parseBase({
          variants: {
            treatment: { label: 'With input', input: [{ action: 'click', selector: '#go' }] },
            control: { label: 'Control' },
          },
        })
      )
    ).toBe(false);
  });

  it('returns false when an expect case defines emulation', () => {
    expect(
      computeLiveInBrowser(
        parseBase({
          expect: {
            'case-a': {
              emulation: { reducedMotion: 'reduce' },
              treatment: { columns: 2 },
              control: { columns: 1 },
            },
          },
        })
      )
    ).toBe(false);
  });

  it('returns false when network.mode is server', () => {
    expect(
      computeLiveInBrowser(
        parseBase({
          kind: 'network',
          network: {
            mode: 'server',
            routes: [{ id: 'api', origin: 'self', method: 'GET', path: '/api', status: 200 }],
          },
        })
      )
    ).toBe(false);
  });

  it('returns false when consoleSource is engine', () => {
    expect(
      computeLiveInBrowser(parseBase({ kind: 'console', consoleSource: 'engine' }))
    ).toBe(false);
  });

  it('returns false when kind is measured', () => {
    expect(
      computeLiveInBrowser(
        parseBase({
          kind: 'measured',
          measured: { repeat: 20, metric: 'layout-ms', minRatio: 2 },
        })
      )
    ).toBe(false);
  });
});
