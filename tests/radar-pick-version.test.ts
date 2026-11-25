import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  pickVersionFromTimeMap,
} from '../scripts/radar/pick-version.mjs';

describe('radar pick-version', () => {
  const nowMs = Date.parse('2026-11-25T07:00:00Z');

  it('picks the highest stable version published at least 14 days ago and ignores prereleases', () => {
    const timeMap = {
      created: '2020-01-01T00:00:00Z',
      modified: '2026-11-24T00:00:00Z',
      '8.1.8': '2026-11-02T10:00:00Z', // 23 days old -> eligible
      '8.1.9': '2026-11-10T10:00:00Z', // 14.875 days old -> eligible
      '8.1.10': '2026-11-19T10:00:00Z', // 5.875 days old -> too recent
      '8.1.11-dev-20261101': '2026-11-01T00:00:00Z', // prerelease -> ignored
      '8.2.0-rc.1': '2026-10-15T00:00:00Z', // prerelease -> ignored
    };

    expect(pickVersionFromTimeMap(timeMap, 14, nowMs)).toBe('8.1.9');
    expect(pickVersionFromTimeMap(timeMap, 20, nowMs)).toBe('8.1.8');
    expect(pickVersionFromTimeMap(timeMap, 1, nowMs)).toBe('8.1.10');
  });

  it('compares semver numerically (8.1.10 > 8.1.9 > 8.1.8)', () => {
    expect(compareSemver('8.1.10', '8.1.9')).toBeGreaterThan(0);
    expect(compareSemver('8.1.9', '8.1.10')).toBeLessThan(0);
    expect(compareSemver('3.47.0', '3.9.0')).toBeGreaterThan(0);
    expect(compareSemver('8.1.8', '8.1.8')).toBe(0);
  });

  it('throws when no stable version satisfies the minimum age', () => {
    const timeMap = {
      created: '2026-11-20T00:00:00Z',
      modified: '2026-11-24T00:00:00Z',
      '1.0.0-dev.1': '2026-01-01T00:00:00Z',
      '1.0.0': '2026-11-20T00:00:00Z',
    };
    expect(() => pickVersionFromTimeMap(timeMap, 14, nowMs)).toThrow(/No stable version/);
  });

  it('unwraps the single-element array returned by npm 12 `npm view <pkg> time --json`', () => {
    const arrayPayload = [
      {
        created: '2020-01-01T00:00:00Z',
        modified: '2026-11-24T00:00:00Z',
        '8.1.8': '2026-11-02T14:21:45.545Z',
        '8.1.9': '2026-11-12T14:13:18.900Z',
        '8.1.10': '2026-11-19T14:43:54.298Z',
      },
    ];
    expect(pickVersionFromTimeMap(arrayPayload, 14, nowMs)).toBe('8.1.8');
  });

  it('never downgrades below the currently installed version', () => {
    const timeMap = {
      '3.45.0': '2026-11-05T10:00:00Z', // 20 days old -> eligible
      '3.47.0': '2026-11-19T20:41:12Z', // 6 days old -> too recent
    };
    expect(pickVersionFromTimeMap(timeMap, 14, nowMs, '3.47.0')).toBe('3.47.0');
    expect(pickVersionFromTimeMap(timeMap, 14, nowMs, '3.44.0')).toBe('3.45.0');
    expect(
      pickVersionFromTimeMap({ '3.47.0': '2026-11-19T20:41:12Z' }, 14, nowMs, '3.47.0'),
    ).toBe('3.47.0');
  });
});

