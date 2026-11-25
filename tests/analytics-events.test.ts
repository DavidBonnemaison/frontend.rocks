import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENTS,
  SERVER_EVENTS,
  TARGET_RE,
  parseEventPath,
  serializeEventPath,
} from '../src/lib/analytics-events';

describe('analytics-events', () => {
  it('defines the 13 client events and 1 server event', () => {
    expect(ANALYTICS_EVENTS).toHaveLength(13);
    expect(SERVER_EVENTS).toEqual(['mcp_call']);
  });

  it('validates TARGET_RE strictly', () => {
    expect(TARGET_RE.test('css-stacking-context')).toBe(true);
    expect(TARGET_RE.test('double-payment-race-condition')).toBe(true);
    expect(TARGET_RE.test('path-id/concept-id')).toBe(true);
    expect(TARGET_RE.test('check_claim')).toBe(true);

    expect(TARGET_RE.test('Hello World')).toBe(false);
    expect(TARGET_RE.test('z-index 9999')).toBe(false);
    expect(TARGET_RE.test('')).toBe(false);
    expect(TARGET_RE.test('foo?bar=1')).toBe(false);
    expect(TARGET_RE.test('user@example.com')).toBe(false);
  });

  it('serializes event paths with allowlisted, sorted props and drops invalid targets or values', () => {
    expect(serializeEventPath('embed_copy', 'css-stacking-context')).toBe(
      'embed_copy/css-stacking-context',
    );
    expect(serializeEventPath('search_zero_results')).toBe('search_zero_results');
    expect(serializeEventPath('embed_copy', 'Hello World')).toBe('embed_copy');
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
    expect(serializeEventPath('mcp_call', 'check_claim')).toBe('mcp_call/check_claim');
  });

  it('round-trips serializeEventPath through parseEventPath', () => {
    const serialized = serializeEventPath('paste_bug_match', 'forced-reflow', {
      stage: 'deterministic',
      kind: 'console',
      matched: true,
      ignored: 'nope',
    });
    expect(parseEventPath(serialized)).toEqual({
      name: 'paste_bug_match',
      target: 'forced-reflow',
      props: { kind: 'console', matched: 'true', stage: 'deterministic' },
    });
  });

  it('parses compound targets like path_step_complete/path-a/concept-b', () => {
    expect(parseEventPath('path_step_complete/path-a/concept-b')).toEqual({
      name: 'path_step_complete',
      target: 'path-a/concept-b',
      props: {},
    });
  });

  it('returns null for unknown event names', () => {
    expect(parseEventPath('not_a_real_event/foo')).toBeNull();
    expect(parseEventPath('')).toBeNull();
  });
});
