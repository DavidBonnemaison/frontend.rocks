import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProofArtifact } from '@/lib/proof/artifact-schema';
import {
  downgradeNeverProvenStale,
  filterInfraErrors,
  prepareRunReport,
  prepareVerifierArtifact,
} from '@/lib/proof/nightly/prepare';
import {
  emptyProofResults,
  type ExperimentRunReport,
  type ProofResults,
} from '@/lib/proof/results-schema';

const NOW = '2026-12-01T02:17:00.000Z';

function makeRunReport(overrides?: Partial<ExperimentRunReport>): ExperimentRunReport {
  return {
    schemaVersion: 1,
    kind: 'experiments',
    generatedAt: NOW,
    runner: { playwright: '1.65.1', node: '24.0.0', os: 'linux', react: null },
    engines: { chromium: '143.0.0.0', firefox: '145.0', webkit: '26.0' },
    shard: null,
    experiments: {
      'exp-a': {
        sourceHash: 'a'.repeat(64),
        runtimeVersion: '1',
        durationMs: 120,
        vacuity: {},
        cases: {
          k1: {
            chromium: {
              status: 'pass',
              observed: { treatment: 1, control: 0 },
              presented: null,
              error: null,
            },
            firefox: {
              status: 'error',
              observed: { treatment: null, control: null },
              presented: null,
              error: 'Target closed while waiting for frame',
            },
            webkit: {
              status: 'fail',
              observed: { treatment: 0, control: 0 },
              presented: null,
              error: null,
            },
          },
        },
      },
    },
    ...overrides,
  };
}

function makeVerifierArtifact(claims: ProofArtifact['claims']): ProofArtifact {
  return {
    schemaVersion: 1,
    kind: 'spec-quotes',
    generatedAt: NOW,
    mode: 'online',
    tooling: { cheerio: '1.2.0' },
    claims,
    pages: {},
  };
}

describe('nightly input preparation', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('strips browser crash / network error cases and records them in infraErrors', () => {
    const report = makeRunReport();
    const { report: cleaned, infraErrors } = filterInfraErrors(report, [
      'chromium',
      'firefox',
      'webkit',
    ]);

    expect(cleaned.experiments['exp-a'].cases.k1.chromium?.status).toBe('pass');
    expect(cleaned.experiments['exp-a'].cases.k1.firefox).toBeUndefined();
    expect(cleaned.experiments['exp-a'].cases.k1.webkit?.status).toBe('fail');
    expect(infraErrors).toHaveLength(1);
    expect(infraErrors[0]).toContain('Target closed');
  });

  it('strips all cases for an expected engine that failed to start', () => {
    const report = makeRunReport({
      engines: { chromium: '143.0.0.0', firefox: '145.0' },
    });
    const { report: cleaned, infraErrors } = filterInfraErrors(report, [
      'chromium',
      'firefox',
      'webkit',
    ]);

    expect(cleaned.experiments['exp-a'].cases.k1.webkit).toBeUndefined();
    expect(infraErrors.some((e) => e.includes('engine webkit missing'))).toBe(true);
  });

  it('downgrades stale to failed when the claim was never proven or stale before', () => {
    const previous: ProofResults = {
      ...emptyProofResults(),
      claims: {
        'page-a/never-proven': {
          status: 'failed',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: NOW,
          provenSince: null,
          failingSince: null,
          reason: 'quote-not-found',
          detail: 'missing',
        },
        'page-a/was-proven': {
          status: 'proven',
          proofKind: 'spec-quote',
          engines: null,
          checkedAt: NOW,
          provenSince: NOW,
          failingSince: null,
          reason: null,
          detail: null,
        },
      },
    };

    const artifact = makeVerifierArtifact({
      'page-a/never-proven': {
        claimId: 'page-a/never-proven',
        status: 'stale',
        reason: 'section-changed',
        message: 'Section hash changed',
        details: {},
        checkedAt: NOW,
      },
      'page-a/was-proven': {
        claimId: 'page-a/was-proven',
        status: 'stale',
        reason: 'section-changed',
        message: 'Section hash changed',
        details: {},
        checkedAt: NOW,
      },
      'page-a/brand-new': {
        claimId: 'page-a/brand-new',
        status: 'stale',
        reason: 'section-changed',
        message: 'Section hash changed',
        details: {},
        checkedAt: NOW,
      },
    });

    const { artifact: prepared, infraErrors } = downgradeNeverProvenStale(artifact, previous);
    expect(infraErrors).toEqual([]);
    expect(prepared.claims['page-a/never-proven'].status).toBe('failed');
    expect(prepared.claims['page-a/never-proven'].reason).toBe('section-changed');
    expect(prepared.claims['page-a/brand-new'].status).toBe('failed');
    expect(prepared.claims['page-a/was-proven'].status).toBe('stale');
  });

  it('removes verifier claims with HTTP >= 500 or timeout errors and records infraErrors', () => {
    const artifact = makeVerifierArtifact({
      'page-a/outage': {
        claimId: 'page-a/outage',
        status: 'failed',
        reason: 'fetch-error',
        message: 'HTTP 503 Service Unavailable',
        details: { status: 503 },
        checkedAt: NOW,
      },
      'page-a/real-fail': {
        claimId: 'page-a/real-fail',
        status: 'failed',
        reason: 'quote-not-found',
        message: 'Quote not found in section',
        details: { status: 200 },
        checkedAt: NOW,
      },
    });

    const { artifact: prepared, infraErrors } = downgradeNeverProvenStale(artifact, null);
    expect(prepared.claims['page-a/outage']).toBeUndefined();
    expect(prepared.claims['page-a/real-fail'].status).toBe('failed');
    expect(infraErrors).toHaveLength(1);
    expect(infraErrors[0]).toContain('page-a/outage');
  });

  it('prepareRunReport and prepareVerifierArtifact handle missing files and unavailable sidecars', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-nightly-prep-'));
    dirs.push(dir);

    expect(prepareRunReport(path.join(dir, 'experiments.json'))).toEqual({
      present: false,
      infraErrors: [],
    });

    const specPath = path.join(dir, 'spec-quotes.json');
    fs.writeFileSync(
      path.join(dir, 'spec-quotes.unavailable.json'),
      JSON.stringify([{ claimId: 'page-a/c1', url: 'https://example.test', error: 'timeout' }])
    );
    const res = prepareVerifierArtifact(specPath, null);
    expect(res.present).toBe(false);
    expect(res.infraErrors).toHaveLength(1);
    expect(res.infraErrors[0]).toContain('page-a/c1');
  });
});
