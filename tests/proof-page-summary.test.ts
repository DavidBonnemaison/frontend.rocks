import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'proof');

describe('summarizePageProof', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns null when a page has no claims file', async () => {
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', FIXTURES_DIR);
    vi.resetModules();
    const { summarizePageProof } = await import('@/lib/proof/page-proof');
    expect(summarizePageProof('nonexistent-page', 'proven')).toBeNull();
  });

  it('summarizes 4 mixed claims with scoped engines and empty engines for non-experiment claims', async () => {
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', FIXTURES_DIR);
    vi.resetModules();
    const { summarizePageProof } = await import('@/lib/proof/page-proof');
    const summary = summarizePageProof(
      'sample-concept',
      'proven',
      new Date('2026-12-02T00:00:00.000Z')
    );

    expect(summary).not.toBeNull();
    expect(summary!.total).toBe(4);
    expect(summary!.effectiveStatus).toBe('proven');
    expect(summary!.byStatus.proven).toBe(4);
    expect(summary!.byType).toEqual({
      observable: 1,
      normative: 1,
      implementation: 0,
      support: 1,
      measured: 0,
      derived: 1,
    });
    expect(summary!.hasExperiments).toBe(true);
    expect(summary!.experimentIds).toEqual(['sample-container-query']);
    expect(summary!.lastCheckedAt).toBe('2026-12-01T02:41:44.000Z');

    const [obs, norm, sup, der] = summary!.rows;
    expect(obs.engines).toEqual({
      chromium: 'pass',
      firefox: 'not-run',
      webkit: 'pass',
    });
    expect(norm.engines).toEqual({});
    expect(sup.engines).toEqual({});
    expect(der.engines).toEqual({});
    expect(obs.proofHref).toBe('/claims/sample-concept/container-applies/');
  });

  it('returns all pending statuses and null lastCheckedAt when latest.json is absent', async () => {
    vi.stubEnv('FRONTEND_ROCKS_CONTENT_DIR', FIXTURES_DIR);
    vi.stubEnv('FR_PROOF_RESULTS_FILE', path.join(FIXTURES_DIR, 'missing-latest.json'));
    vi.resetModules();
    const { summarizePageProof } = await import('@/lib/proof/page-proof');
    const summary = summarizePageProof('sample-concept', 'proven');

    expect(summary).not.toBeNull();
    expect(summary!.effectiveStatus).toBe('unverified');
    expect(summary!.byStatus.pending).toBe(4);
    expect(summary!.lastCheckedAt).toBeNull();
    expect(summary!.rows.every((r) => r.status === 'pending')).toBe(true);
  });
});
