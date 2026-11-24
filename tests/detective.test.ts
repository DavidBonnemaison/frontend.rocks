import { describe, expect, it } from 'vitest';
import { buildDetectiveOptions, hashSlugFnv1a } from '@/lib/detective';
import { getAllAutopsies } from '@/lib/content-loader';

describe('DevTools Detective option generation (US-17.2)', () => {
  const sampleCaseFile = {
    root_cause: 'Both native `click` tasks enter the queue before React commits `disabled={true}`',
    bad_fixes: [
      {
        label: '`disabled={isSubmitting}`',
        outcome: 'Passed Playwright locally; still double-charged on slow Android main threads',
      },
      {
        label: '300 ms `debounce` on `onClick`',
        outcome: 'Delayed every click by 300 ms and failed again when a 3G `POST` took 4 seconds',
      },
    ],
  };

  it('produces identical deterministic ordering for the same slug across calls', () => {
    const first = buildDetectiveOptions('double-payment-race-condition', sampleCaseFile);
    const second = buildDetectiveOptions('double-payment-race-condition', sampleCaseFile);

    expect(first).toEqual(second);
    expect(hashSlugFnv1a('double-payment-race-condition')).toBe(
      hashSlugFnv1a('double-payment-race-condition')
    );
  });

  it('varies option order across different slugs', () => {
    const slugs = [
      'double-payment-race-condition',
      'eight-hour-spa-memory-leak',
      'fourteen-rerenders-one-click',
      'zombie-bundle-after-deploy',
      'zindex-9999-tooltip-war',
      'hydration-flicker-and-bailout',
      'green-ci-broken-prod-jsdom',
      'offline-first-conflict-storm',
    ];

    const rootCauseIndices = new Set(
      slugs.map((slug) =>
        buildDetectiveOptions(slug, sampleCaseFile).findIndex((opt) => opt.isRootCause)
      )
    );

    expect(rootCauseIndices.size).toBeGreaterThan(1);
  });

  it('always returns 3 to 4 options with exactly 1 root cause and 2 to 3 distractors', () => {
    const withOneBadFix = buildDetectiveOptions(
      'single-bad-fix-slug',
      {
        root_cause: 'Un-disconnected observer retained detached DOM nodes',
        bad_fixes: [
          {
            label: 'Set local array to `null` in cleanup',
            outcome: 'Native observer still held a root reference to the closure',
          },
        ],
      },
      'memory-exhaustion'
    );

    expect(withOneBadFix.length).toBeGreaterThanOrEqual(3);
    expect(withOneBadFix.length).toBeLessThanOrEqual(4);
    expect(withOneBadFix.filter((o) => o.isRootCause)).toHaveLength(1);
    expect(withOneBadFix.filter((o) => !o.isRootCause)).toHaveLength(2);

    const withFourBadFixes = buildDetectiveOptions('many-bad-fixes-slug', {
      root_cause: 'Wrapper created a new stacking context',
      bad_fixes: [
        { label: 'Fix 1', outcome: 'Outcome 1' },
        { label: 'Fix 2', outcome: 'Outcome 2' },
        { label: 'Fix 3', outcome: 'Outcome 3' },
        { label: 'Fix 4', outcome: 'Outcome 4' },
      ],
    });

    expect(withFourBadFixes).toHaveLength(4);
    expect(withFourBadFixes.filter((o) => o.isRootCause)).toHaveLength(1);
    expect(withFourBadFixes.filter((o) => !o.isRootCause)).toHaveLength(3);
  });

  it('generates valid detective options for every real autopsy in content/autopsies/', () => {
    const autopsies = getAllAutopsies();
    expect(autopsies.length).toBeGreaterThanOrEqual(14);

    for (const autopsy of autopsies) {
      const { id, case_file, failure_mode } = autopsy.frontmatter;
      const options = buildDetectiveOptions(id, case_file, failure_mode);

      expect(options.length, `${id} should have 3 to 4 options`).toBeGreaterThanOrEqual(3);
      expect(options.length, `${id} should have 3 to 4 options`).toBeLessThanOrEqual(4);

      const rootCauses = options.filter((opt) => opt.isRootCause);
      const badFixes = options.filter((opt) => !opt.isRootCause);

      expect(rootCauses, `${id} must have exactly 1 root cause`).toHaveLength(1);
      expect(badFixes.length, `${id} must have 2 to 3 distractors`).toBeGreaterThanOrEqual(2);
      expect(badFixes.length, `${id} must have 2 to 3 distractors`).toBeLessThanOrEqual(3);

      expect(rootCauses[0].label).toBe(case_file.root_cause.trim());

      const uniqueIds = new Set(options.map((opt) => opt.id));
      const uniqueLabels = new Set(options.map((opt) => opt.label.toLowerCase()));
      expect(uniqueIds.size, `${id} option ids must be unique`).toBe(options.length);
      expect(uniqueLabels.size, `${id} option labels must be unique`).toBe(options.length);

      for (const opt of options) {
        expect(opt.label.trim().length, `${id} option label must be non-empty`).toBeGreaterThan(0);
        if (!opt.isRootCause) {
          expect(
            opt.outcome && opt.outcome.trim().length,
            `${id} distractor "${opt.label}" must have a non-empty outcome`
          ).toBeGreaterThan(0);
        }
      }

      // Deterministic repeatability check on every real autopsy
      expect(buildDetectiveOptions(id, case_file, failure_mode)).toEqual(options);
    }
  });
});
