// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TARGET_RE,
  __resetAnalyticsForTests,
  serializeEventPath,
  track,
  trackOnce,
  trackPageview,
} from '../src/lib/analytics';

describe('analytics (client)', () => {
  beforeEach(() => {
    __resetAnalyticsForTests();
    window.localStorage.clear();
    delete window.__frAnalyticsDebug;
    delete window.goatcounter;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is a no-op without NEXT_PUBLIC_GOATCOUNTER_ENDPOINT', () => {
    const count = vi.fn();
    window.goatcounter = { count };
    track('embed_copy', 'css-stacking-context');
    expect(count).not.toHaveBeenCalled();
  });

  it('validates TARGET_RE and drops invalid targets in debug mode', () => {
    expect(TARGET_RE.test('Hello World')).toBe(false);
    expect(TARGET_RE.test('z-index 9999')).toBe(false);
    expect(TARGET_RE.test('')).toBe(false);
    expect(TARGET_RE.test('a?b')).toBe(false);
    expect(TARGET_RE.test('a@b')).toBe(false);
    expect(TARGET_RE.test('css-stacking-context')).toBe(true);
    expect(TARGET_RE.test('double-payment-race-condition')).toBe(true);
    expect(TARGET_RE.test('path-id/concept-id')).toBe(true);
    expect(TARGET_RE.test('check_claim')).toBe(true);

    window.localStorage.setItem('fr-analytics-debug', '1');
    track('embed_copy', 'Hello World');
    expect(window.__frAnalyticsDebug).toEqual([{ path: 'embed_copy', event: true }]);
  });

  it('serializes allowlisted props and rejects invalid values', () => {
    expect(
      serializeEventPath('paste_bug_match', undefined, {
        stage: 'deterministic',
        kind: 'console',
        matched: true,
        query: 'x',
      }),
    ).toBe('paste_bug_match;kind=console;matched=true;stage=deterministic');
    expect(serializeEventPath('paste_bug_submit', undefined, { kind: 'Some Text' })).toBe(
      'paste_bug_submit',
    );
  });

  it('records valid events in debug mode', () => {
    window.localStorage.setItem('fr-analytics-debug', '1');
    track('embed_copy', 'css-stacking-context');
    expect(window.__frAnalyticsDebug).toEqual([
      { path: 'embed_copy/css-stacking-context', event: true },
    ]);
  });

  it('deduplicates trackOnce per pageview and resets on trackPageview', () => {
    window.localStorage.setItem('fr-analytics-debug', '1');
    trackOnce('experiment_interact', 'event-loop-tasks-microtasks');
    trackOnce('experiment_interact', 'event-loop-tasks-microtasks');
    expect(window.__frAnalyticsDebug).toHaveLength(1);

    trackPageview('/concepts/event-loop-tasks-microtasks');
    trackOnce('experiment_interact', 'event-loop-tasks-microtasks');
    expect(window.__frAnalyticsDebug).toEqual([
      { path: 'experiment_interact/event-loop-tasks-microtasks', event: true },
      { path: '/concepts/event-loop-tasks-microtasks/', event: false },
      { path: 'experiment_interact/event-loop-tasks-microtasks', event: true },
    ]);
  });

  it('queues calls before goatcounter loads and flushes them in order on production host', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOATCOUNTER_ENDPOINT', 'https://frontendrocks.goatcounter.com/count');
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'frontend.rocks' },
    });

    try {
      vi.resetModules();
      const mod = await import('../src/lib/analytics');
      mod.__resetAnalyticsForTests();

      mod.trackPageview('/');
      mod.track('embed_copy', 'css-stacking-context');

      const count = vi.fn();
      window.goatcounter = { count };
      mod.flushAnalyticsQueue();

      expect(count).toHaveBeenCalledTimes(2);
      expect(count.mock.calls[0]?.[0]).toMatchObject({ path: '/', event: false });
      expect(count.mock.calls[1]?.[0]).toEqual({
        path: 'embed_copy/css-stacking-context',
        title: 'embed_copy',
        event: true,
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
