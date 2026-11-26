import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClaimHistory, getGlobalRunHistory } from '@/lib/proof/history-loader';

describe('history-loader', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('reduces 10 nights across 3 files with a corrupted line into 2 status changes, newest first', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-history-test-'));
    dirs.push(dir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // File 1: 4 nights, all proven -> 1 initial transition (null -> proven)
    fs.writeFileSync(
      path.join(dir, '2026-10.jsonl'),
      [
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-10-28T02:00:00Z' }),
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-10-29T02:00:00Z' }),
        '{not valid json',
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-10-30T02:00:00Z' }),
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-10-31T02:00:00Z' }),
      ].join('\n')
    );

    // File 2: 3 nights, still proven, then diverges on Nov 3 -> 2nd transition (proven -> diverges)
    fs.writeFileSync(
      path.join(dir, '2026-11.jsonl'),
      [
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-11-01T02:00:00Z' }),
        JSON.stringify({ claimId: 'p/a', status: 'proven', at: '2026-11-02T02:00:00Z' }),
        JSON.stringify({
          claimId: 'p/a',
          status: 'diverges',
          at: '2026-11-03T02:00:00Z',
          engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
        }),
      ].join('\n')
    );

    // File 3: 3 nights, remains diverges (no new transition)
    fs.writeFileSync(
      path.join(dir, '2026-12.jsonl'),
      [
        JSON.stringify({ claimId: 'p/a', status: 'diverges', at: '2026-12-01T02:00:00Z' }),
        JSON.stringify({ claimId: 'p/a', status: 'diverges', at: '2026-12-02T02:00:00Z' }),
        JSON.stringify({ claimId: 'p/a', status: 'diverges', at: '2026-12-03T02:00:00Z' }),
      ].join('\n')
    );

    const changes = getClaimHistory('p/a', 20, dir);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([
      {
        at: '2026-11-03T02:00:00Z',
        from: 'proven',
        to: 'diverges',
        engines: { chromium: 'pass', firefox: 'pass', webkit: 'fail' },
      },
      {
        at: '2026-10-28T02:00:00Z',
        from: null,
        to: 'proven',
      },
    ]);
  });

  it('extracts chronological run points for global history chart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-history-runs-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, '2026-11.jsonl'),
      [
        JSON.stringify({ type: 'run', at: '2026-11-01T02:00:00Z', proven: 12, total: 14 }),
        JSON.stringify({ type: 'run', at: '2026-11-02T02:00:00Z', byStatus: { proven: 15, failed: 1 } }),
      ].join('\n')
    );

    expect(getGlobalRunHistory(90, dir)).toEqual([
      { at: '2026-11-01T02:00:00Z', proven: 12, total: 14 },
      { at: '2026-11-02T02:00:00Z', proven: 15, total: 16 },
    ]);
  });
});
