import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSpecDriftReport } from '@/lib/proof/spec/drift';
import { __resetFetchSpecMemo } from '@/lib/proof/spec/fetch-spec';
import { __resetPoliteFetchState } from '@/lib/proof/spec/http';
import { specRecordPath, type SpecQuoteClaim } from '@/lib/proof/spec/record';
import {
  recordObservedQuote,
  verifySpecQuote,
  __resetParsedSpecCache,
} from '@/lib/proof/spec/verify';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'specs');
const whatwg = fs.readFileSync(path.join(FIXTURES_DIR, 'whatwg-webappapis.html'), 'utf-8');

function makeResponse(body: string, status = 200, url?: string): Response {
  const res = new Response(body, { status });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
}

function makeClaim(): SpecQuoteClaim {
  return {
    id: 'event-loop-tasks-microtasks/microtask-drain',
    type: 'normative',
    statement: 'The event loop drains the microtask queue until it is empty during a checkpoint.',
    proof: {
      kind: 'spec-quote',
      url: 'https://html.spec.whatwg.org/multipage/webappapis.html',
      anchor: 'perform-a-microtask-checkpoint',
      quote:
        "While the event loop's microtask queue is not empty: Let oldestMicrotask be the result of dequeuing from the event loop's microtask queue.",
    },
  };
}

describe('buildSpecDriftReport', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-drift-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    __resetPoliteFetchState();
    __resetFetchSpecMemo();
    __resetParsedSpecCache();
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  async function seedRecord(claim: SpecQuoteClaim, recordDir: string, cacheDir: string): Promise<void> {
    const fetchImpl = (async () => makeResponse(whatwg, 200, claim.proof.url)) as typeof fetch;
    const initial = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(initial.kind === 'result' && initial.observed).toBeTruthy();
    if (initial.kind === 'result' && initial.observed) {
      recordObservedQuote(claim, initial.observed, '2026-12-01', recordDir);
    }
    __resetFetchSpecMemo();
    __resetParsedSpecCache();
  }

  it('reports stale with quote-not-found when the cited paragraph is removed', async () => {
    const root = makeTempDir();
    const recordDir = path.join(root, 'records');
    const cacheDir = path.join(root, 'cache');
    const claim = makeClaim();
    await seedRecord(claim, recordDir, cacheDir);

    const modified = whatwg.replace(
      "While the <a href=#event-loop>event loop</a>'s <a href=#microtask-queue>microtask queue</a> is not <a href=https://infra.spec.whatwg.org/#list-is-empty>empty</a>:",
      'The queue has been redesigned.'
    );
    const fetchImpl = (async () => makeResponse(modified, 200, claim.proof.url)) as typeof fetch;
    const outcome = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });

    expect(outcome.kind === 'result' && outcome.result.status).toBe('stale');
    expect(buildSpecDriftReport([{ claim, outcome }])).toEqual([
      {
        claimId: claim.id,
        kind: 'stale',
        reason: 'quote-not-found',
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      },
    ]);
  });

  it('reports no drift when only a non-normative note changes', async () => {
    const root = makeTempDir();
    const recordDir = path.join(root, 'records');
    const cacheDir = path.join(root, 'cache');
    const claim = makeClaim();
    await seedRecord(claim, recordDir, cacheDir);

    const modifiedNote = whatwg.replace(
      'This might involve invoking scripted callbacks, which eventually calls the clean up after running script steps.',
      'Completely rewritten editorial note that is still non-normative.'
    );
    const fetchImpl = (async () => makeResponse(modifiedNote, 200, claim.proof.url)) as typeof fetch;
    const outcome = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });

    expect(outcome.kind === 'result' && outcome.result.status).toBe('proven');
    expect(buildSpecDriftReport([{ claim, outcome }])).toEqual([]);
  });

  it('reports section-changed while keeping claim proven when another normative sentence changes', async () => {
    const root = makeTempDir();
    const recordDir = path.join(root, 'records');
    const cacheDir = path.join(root, 'cache');
    const claim = makeClaim();
    await seedRecord(claim, recordDir, cacheDir);

    const modifiedSiblingSentence = whatwg.replace(
      'is true, then return.',
      'is true, then return immediately.'
    );
    const fetchImpl = (async () =>
      makeResponse(modifiedSiblingSentence, 200, claim.proof.url)) as typeof fetch;
    const outcome = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });

    expect(outcome.kind === 'result' && outcome.result.status).toBe('proven');
    expect(buildSpecDriftReport([{ claim, outcome }])).toEqual([
      {
        claimId: claim.id,
        kind: 'section-changed',
        reason: null,
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      },
    ]);
  });

  it('reports unavailable on permanent 503 without modifying committed records', async () => {
    const root = makeTempDir();
    const recordDir = path.join(root, 'records');
    const cacheDir = path.join(root, 'cache');
    const claim = makeClaim();
    await seedRecord(claim, recordDir, cacheDir);

    const recPath = specRecordPath(claim.proof.url, recordDir);
    const beforeBytes = fs.readFileSync(recPath, 'utf-8');

    const fetch503 = (async () => makeResponse('service unavailable', 503)) as typeof fetch;
    const outcome = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: fetch503, cacheDir, retries: 1, minIntervalMs: 0, sleep: async () => {} },
    });

    expect(outcome.kind).toBe('unavailable');
    expect(buildSpecDriftReport([{ claim, outcome }])).toEqual([
      {
        claimId: claim.id,
        kind: 'unavailable',
        reason: null,
        url: claim.proof.url,
        anchor: claim.proof.anchor,
      },
    ]);
    expect(fs.readFileSync(recPath, 'utf-8')).toBe(beforeBytes);
  });
});
