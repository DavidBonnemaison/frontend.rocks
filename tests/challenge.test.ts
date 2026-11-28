import { describe, expect, it } from 'vitest';
import {
  buildChallengeBundle,
  checkForbidden,
  getReferenceSolution,
  getStartingCode,
  isSuccess,
  targetVariant,
  validateChallengeAgainstExperiment,
} from '@/lib/proof/challenge';
import { ChallengeSchema, type Challenge } from '@/lib/proof/challenge-schema';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';

function makeBundle(overrides: Partial<ExperimentBundle> = {}): ExperimentBundle {
  return {
    schemaVersion: 1,
    id: 'container-query-inline-size',
    title: '@container reads the container',
    question: 'Does the card switch to two columns?',
    kind: 'fixture',
    fixture: { html: '<div class="slot"><article class="card" /></div>' },
    params: {
      w: { kind: 'range', label: 'Width', min: 220, max: 640, step: 20, default: 480, unit: 'px' },
    },
    variants: {
      treatment: { label: 'With container', css: '.slot { container-type: inline-size; }' },
      control: { label: 'No container', css: '.slot { /* add container query */ }' },
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

const sampleChallenge: Challenge = ChallengeSchema.parse({
  goal: 'Make the card switch to two columns at 480 px without touching the viewport.',
  startFrom: 'control',
  editable: 'css',
  expectKey: 'two-columns-at-480',
  hint: 'Declare container-type: inline-size on .slot.',
  forbid: ['@media', 'grid-template-columns'],
});

describe('Break it / Fix it challenge helpers', () => {
  it('validates ChallengeSchema and rejects unknown keys', () => {
    expect(() =>
      ChallengeSchema.parse({
        goal: 'Short',
        startFrom: 'control',
        editable: 'css',
        expectKey: 'two-columns-at-480',
      }),
    ).toThrow();

    expect(() =>
      ChallengeSchema.parse({
        goal: 'Make the card switch to two columns at 480 px.',
        startFrom: 'control',
        editable: 'css',
        expectKey: 'two-columns-at-480',
        extra: true,
      }),
    ).toThrow();
  });

  it('computes targetVariant, starting code, reference solution, and buildChallengeBundle', () => {
    const bundle = makeBundle();
    expect(targetVariant(sampleChallenge)).toBe('treatment');
    expect(getStartingCode(bundle, sampleChallenge)).toBe('.slot { /* add container query */ }');
    expect(getReferenceSolution(bundle, sampleChallenge)).toBe(
      '.slot { container-type: inline-size; }',
    );

    const edited = buildChallengeBundle(
      bundle,
      sampleChallenge,
      '.slot { container-type: inline-size; }',
    );
    expect(edited.variants.control.css).toBe('.slot { container-type: inline-size; }');
    // Original bundle is not mutated.
    expect(bundle.variants.control.css).toBe('.slot { /* add container query */ }');
  });

  it('detects forbidden substrings before execution', () => {
    expect(checkForbidden(sampleChallenge, '.slot { container-type: inline-size; }')).toBeNull();
    expect(checkForbidden(sampleChallenge, '@media (min-width: 420px) { .card {} }')).toBe(
      '@media',
    );
    expect(checkForbidden(sampleChallenge, '.card { grid-template-columns: 160px 1fr; }')).toBe(
      'grid-template-columns',
    );
  });

  it('evaluates isSuccess using canonical JSON equality', () => {
    const bundle = makeBundle();
    expect(isSuccess(bundle, sampleChallenge, { columns: 2 })).toBe(true);
    expect(isSuccess(bundle, sampleChallenge, { columns: 1 })).toBe(false);
  });

  it('rejects challenges on measured experiments and identical treatment/control expects', () => {
    const measured = makeBundle({ kind: 'measured' });
    const measuredErrors = validateChallengeAgainstExperiment(measured, sampleChallenge);
    expect(measuredErrors.some((e) => e.includes('measured'))).toBe(true);

    const sameExpect: Challenge = { ...sampleChallenge, expectKey: 'one-column-at-300' };
    const sameErrors = validateChallengeAgainstExperiment(makeBundle(), sameExpect);
    expect(sameErrors.some((e) => e.includes('identical'))).toBe(true);

    const missingExpect: Challenge = { ...sampleChallenge, expectKey: 'missing-key' };
    const missingErrors = validateChallengeAgainstExperiment(makeBundle(), missingExpect);
    expect(missingErrors.some((e) => e.includes('does not exist'))).toBe(true);

    expect(validateChallengeAgainstExperiment(makeBundle(), sampleChallenge)).toEqual([]);
  });
});
