import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateNightlyHealth,
  readRecentRunRecords,
} from '@/lib/proof/nightly/health';

const SITE_ROOT = process.cwd();

describe('nightly health metrics and CLI', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('computes 30-day median and max duration and flags runs older than 48h as stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-health-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, '2026-11.jsonl'),
      [
        // Older than 30 days: excluded
        JSON.stringify({ kind: 'run', at: '2026-10-15T02:17:00Z', durationMs: 999_000, infraErrors: 0 }),
        JSON.stringify({ kind: 'run', at: '2026-11-28T02:17:00Z', durationMs: 300_000, infraErrors: 0 }),
        JSON.stringify({ kind: 'claim', at: '2026-11-28T02:17:00Z', claimId: 'p/c', from: 'proven', to: 'failed' }),
        JSON.stringify({ kind: 'run', at: '2026-11-29T02:17:00Z', durationMs: 420_000, infraErrors: 0 }),
        JSON.stringify({ kind: 'run', at: '2026-11-30T02:17:00Z', durationMs: 600_000, infraErrors: 1 }),
      ].join('\n') + '\n'
    );

    const freshNow = new Date('2026-12-01T02:17:00Z');
    const records = readRecentRunRecords(dir, freshNow);
    expect(records).toHaveLength(3);

    const freshReport = evaluateNightlyHealth(records, freshNow);
    expect(freshReport.stale).toBe(false);
    expect(freshReport.medianDurationMs).toBe(420_000);
    expect(freshReport.maxDurationMs).toBe(600_000);
    expect(freshReport.aboveDurationBudget).toBe(false);

    const staleNow = new Date('2026-12-03T03:00:00Z'); // > 72h after 2026-11-30
    const staleReport = evaluateNightlyHealth(records, staleNow);
    expect(staleReport.stale).toBe(true);
    expect(staleReport.ageHours).toBeGreaterThan(48);
  });

  it('CLI exits 0 for recent history and exits 1 when the last run is 3 days old', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-health-cli-'));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, '2026-11.jsonl'),
      JSON.stringify({
        kind: 'run',
        at: '2026-11-30T02:17:00Z',
        durationMs: 360_000,
        infraErrors: 0,
      }) + '\n'
    );

    const ok = spawnSync(
      'npx',
      ['tsx', 'scripts/proof/nightly-health.ts', '--history-dir', dir, '--now', '2026-12-01T02:17:00Z'],
      { cwd: SITE_ROOT, encoding: 'utf-8' }
    );
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('Median duration');
    expect(ok.stdout).toContain('6.00 min');

    const stale = spawnSync(
      'npx',
      ['tsx', 'scripts/proof/nightly-health.ts', '--history-dir', dir, '--now', '2026-12-03T03:17:00Z'],
      { cwd: SITE_ROOT, encoding: 'utf-8' }
    );
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('stale');
  });
});
