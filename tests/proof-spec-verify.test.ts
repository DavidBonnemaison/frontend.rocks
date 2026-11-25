import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProofArtifactSchema } from '@/lib/proof/artifact-schema';
import { UNANCHORED, type PageProofStatus } from '@/lib/proof/claim-schema';
import {
  DEFAULT_USER_AGENT,
  politeFetchText,
  __resetPoliteFetchState,
} from '@/lib/proof/spec/http';
import {
  fetchSpecPage,
  isUnrenderedRespec,
  __resetFetchSpecMemo,
} from '@/lib/proof/spec/fetch-spec';
import { writeCachedSpecHtml } from '@/lib/proof/spec/html-cache';
import {
  pruneSpecRecords,
  readSpecRecord,
  specRecordPath,
  type SpecQuoteClaim,
} from '@/lib/proof/spec/record';
import {
  computeExitCode,
  recordObservedQuote,
  verifySpecQuote,
  __resetParsedSpecCache,
} from '@/lib/proof/spec/verify';
import { buildSpecQuotesArtifact } from '../scripts/proof/verify-spec-quotes';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'specs');
const loadFixture = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');

function makeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string>; url?: string } = {}
): Response {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
  if (init.url) {
    Object.defineProperty(res, 'url', { value: init.url });
  }
  return res;
}

function makeClaim(overrides: Partial<SpecQuoteClaim['proof']> & { id?: string } = {}): SpecQuoteClaim {
  return {
    id: overrides.id ?? 'event-loop-tasks-microtasks/microtask-drain',
    type: 'normative',
    statement: 'The event loop drains the microtask queue until it is empty during a checkpoint.',
    proof: {
      kind: 'spec-quote',
      url: overrides.url ?? 'https://html.spec.whatwg.org/multipage/webappapis.html',
      anchor: overrides.anchor ?? 'perform-a-microtask-checkpoint',
      quote:
        overrides.quote ??
        "While the event loop's microtask queue is not empty: Let oldestMicrotask be the result of dequeuing from the event loop's microtask queue.",
    },
  };
}

describe('politeFetchText', () => {
  beforeEach(() => {
    __resetPoliteFetchState();
  });

  it('uses a generic User-Agent with no personal name, email, or site domain', async () => {
    let seenUa = '';
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenUa = headers.get('user-agent') ?? '';
      return makeResponse('<html>ok</html>');
    }) as typeof fetch;

    const res = await politeFetchText('https://drafts.csswg.org/css-conditional-5/', {
      fetchImpl,
      sleep: async () => {},
    });
    expect(res.ok).toBe(true);
    expect(seenUa).toBe(DEFAULT_USER_AGENT);
    expect(seenUa).not.toMatch(/frontend\.rocks|bonnemaison|@/i);
  });

  it('throttles two requests to the same host by at least 1000 ms', async () => {
    let clock = 10_000;
    const sleeps: number[] = [];
    const fetchImpl = (async () => makeResponse('<html>ok</html>')) as typeof fetch;
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    };

    await politeFetchText('https://drafts.csswg.org/a/', {
      fetchImpl,
      now: () => clock,
      sleep,
    });
    clock += 200;
    await politeFetchText('https://drafts.csswg.org/b/', {
      fetchImpl,
      now: () => clock,
      sleep,
    });

    expect(sleeps).toEqual([800]);
  });

  it('retries 503 then succeeds on 200', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return makeResponse('unavailable', { status: 503 });
      return makeResponse('<html>recovered</html>', { status: 200 });
    }) as typeof fetch;

    const res = await politeFetchText('https://drafts.csswg.org/css-conditional-5/', {
      fetchImpl,
      minIntervalMs: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(res.ok).toBe(true);
    expect(res.body).toBe('<html>recovered</html>');
    expect(calls).toBe(2);
    expect(sleeps.length).toBe(1);
  });

  it('does not retry 404 responses', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return makeResponse('not found', { status: 404 });
    }) as typeof fetch;

    const res = await politeFetchText('https://drafts.csswg.org/missing/', {
      fetchImpl,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(calls).toBe(1);
  });

  it('honors Retry-After header on 429', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    let clock = 50_000;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        return makeResponse('rate limited', { status: 429, headers: { 'Retry-After': '2' } });
      }
      return makeResponse('<html>ok</html>', { status: 200 });
    }) as typeof fetch;

    const res = await politeFetchText('https://drafts.csswg.org/css-conditional-5/', {
      fetchImpl,
      minIntervalMs: 0,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    expect(res.ok).toBe(true);
    expect(sleeps).toEqual([2000]);
  });

  it('rejects responses exceeding maxBytes', async () => {
    const fetchImpl = (async () => makeResponse('x'.repeat(200), { status: 200 })) as typeof fetch;
    const res = await politeFetchText('https://drafts.csswg.org/big/', {
      fetchImpl,
      maxBytes: 100,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('too large');
  });
});

describe('fetchSpecPage', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-html-cache-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    __resetPoliteFetchState();
    __resetFetchSpecMemo();
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('memoizes repeated calls for the same canonical URL in a single run', async () => {
    const cacheDir = makeTempDir();
    const fetchImpl = vi.fn(async () =>
      makeResponse('<html><body><h2 id="a">Spec</h2></body></html>', {
        url: 'https://drafts.csswg.org/css-conditional-5/',
      })
    ) as unknown as typeof fetch;

    const r1 = await fetchSpecPage('https://drafts.csswg.org/css-conditional-5/#a', {
      fetchImpl,
      cacheDir,
      maxAgeHours: 24,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    const r2 = await fetchSpecPage('https://drafts.csswg.org/css-conditional-5/#b', {
      fetchImpl,
      cacheDir,
      maxAgeHours: 24,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    const r3 = await fetchSpecPage('https://drafts.csswg.org/css-conditional-5/', {
      fetchImpl,
      cacheDir,
      maxAgeHours: 24,
      minIntervalMs: 0,
      sleep: async () => {},
    });

    expect('html' in r1 && 'html' in r2 && 'html' in r3).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses cached HTML when younger than maxAgeHours and bypasses cache when maxAgeHours is 0', async () => {
    const cacheDir = makeTempDir();
    const url = 'https://drafts.csswg.org/css-conditional-5/';
    const nowMs = Date.parse('2026-12-01T12:00:00Z');
    const twoHoursAgo = new Date(nowMs - 2 * 3_600_000).toISOString();

    writeCachedSpecHtml(
      url,
      '<html><body><p>cached version</p></body></html>',
      { url, finalUrl: url, fetchedAt: twoHoursAgo, renderedWithBrowser: false },
      cacheDir
    );

    const fetchImpl = vi.fn(async () =>
      makeResponse('<html><body><p>fresh network version</p></body></html>', { url })
    ) as unknown as typeof fetch;

    const fromCache = await fetchSpecPage(url, {
      fetchImpl,
      cacheDir,
      maxAgeHours: 24,
      now: () => nowMs,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    expect('html' in fromCache && fromCache.html).toContain('cached version');
    expect(fetchImpl).not.toHaveBeenCalled();

    __resetFetchSpecMemo();
    const fromNetwork = await fetchSpecPage(url, {
      fetchImpl,
      cacheDir,
      maxAgeHours: 0,
      now: () => nowMs,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    expect('html' in fromNetwork && fromNetwork.html).toContain('fresh network version');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('detects unrendered ReSpec pages and renders via injected renderRespec', async () => {
    const cacheDir = makeTempDir();
    const unrendered = loadFixture('respec-unrendered.html');
    expect(isUnrenderedRespec(unrendered)).toBe(true);

    const renderedHtml =
      '<!doctype html><html><body><nav id="toc"></nav><section id="intro"><h2>Introduction</h2><p>Rendered.</p></section></body></html>';
    expect(isUnrenderedRespec(renderedHtml)).toBe(false);

    const url = 'https://w3c.github.io/example-spec/';
    const fetchImpl = vi.fn(async () => makeResponse(unrendered, { url })) as unknown as typeof fetch;
    const renderRespec = vi.fn(async () => renderedHtml);

    const res = await fetchSpecPage(url, {
      fetchImpl,
      renderRespec,
      cacheDir,
      maxAgeHours: 0,
      minIntervalMs: 0,
      sleep: async () => {},
    });

    expect('html' in res).toBe(true);
    if ('html' in res) {
      expect(res.renderedWithBrowser).toBe(true);
      expect(res.html).toBe(renderedHtml);
    }
    expect(renderRespec).toHaveBeenCalledTimes(1);
  });

  it('rejects redirects outside the allow-list', async () => {
    const cacheDir = makeTempDir();
    const fetchImpl = (async () =>
      makeResponse('<html>moved</html>', { url: 'https://example.com/other' })) as typeof fetch;

    const res = await fetchSpecPage('https://w3c.github.io/old-spec/', {
      fetchImpl,
      cacheDir,
      maxAgeHours: 0,
      minIntervalMs: 0,
      sleep: async () => {},
    });
    expect('error' in res && res.error).toBe('domain-not-allowed');
  });
});

describe('verifySpecQuote, records, and artifact', () => {
  const tempDirs: string[] = [];
  const whatwg = loadFixture('whatwg-webappapis.html');

  function makeTempDir(prefix = 'spec-verify-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

  it('returns not-recorded before recording, proven after recording, and identical status for maxAgeHours 24 and 0', async () => {
    const root = makeTempDir();
    const cacheDir = path.join(root, 'http-cache');
    const recordDir = path.join(root, 'records');
    const claim = makeClaim();
    const fetchImpl = (async () =>
      makeResponse(whatwg, { url: claim.proof.url })) as typeof fetch;

    const first = await verifySpecQuote({
      claim,
      maxAgeHours: 24,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(first.kind).toBe('result');
    if (first.kind !== 'result') return;
    expect(first.result.status).toBe('failed');
    expect(first.result.reason).toBe('not-recorded');
    expect(first.observed).not.toBeNull();

    // Record the observed quote and verify byte-for-byte determinism
    recordObservedQuote(claim, first.observed!, '2026-12-01', recordDir);
    const recPath = specRecordPath(claim.proof.url, recordDir);
    const bytes1 = fs.readFileSync(recPath, 'utf-8');
    expect(bytes1).not.toContain('"normativeText"');

    recordObservedQuote(claim, first.observed!, '2026-12-01', recordDir);
    const bytes2 = fs.readFileSync(recPath, 'utf-8');
    expect(bytes2).toBe(bytes1);

    // PR mode (maxAgeHours: 24) and nightly mode (maxAgeHours: 0) yield the exact same status
    __resetFetchSpecMemo();
    const prRun = await verifySpecQuote({
      claim,
      maxAgeHours: 24,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    __resetFetchSpecMemo();
    const nightlyRun = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });

    expect(prRun.kind === 'result' && prRun.result.status).toBe('proven');
    expect(nightlyRun.kind === 'result' && nightlyRun.result.status).toBe('proven');
  });

  it('returns stale when a recorded quote disappears, and failed when never recorded', async () => {
    const root = makeTempDir();
    const cacheDir = path.join(root, 'http-cache');
    const recordDir = path.join(root, 'records');
    const claim = makeClaim();

    const originalFetch = (async () =>
      makeResponse(whatwg, { url: claim.proof.url })) as typeof fetch;

    const found = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: originalFetch, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(found.kind === 'result' && found.observed).toBeTruthy();

    const removedHtml = whatwg.replace(
      "While the <a href=#event-loop>event loop</a>'s <a href=#microtask-queue>microtask queue</a> is not <a href=https://infra.spec.whatwg.org/#list-is-empty>empty</a>:",
      'Completely rewritten spec paragraph.'
    );
    const updatedFetch = (async () =>
      makeResponse(removedHtml, { url: claim.proof.url })) as typeof fetch;

    // Never recorded -> failed
    __resetFetchSpecMemo();
    const unrecordedGone = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: updatedFetch, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(unrecordedGone.kind === 'result' && unrecordedGone.result.status).toBe('failed');
    expect(unrecordedGone.kind === 'result' && unrecordedGone.result.reason).toBe('quote-not-found');

    // Recorded -> stale (same in both maxAgeHours 24 and 0)
    if (found.kind === 'result' && found.observed) {
      recordObservedQuote(claim, found.observed, '2026-12-01', recordDir);
    }
    __resetFetchSpecMemo();
    const recordedGonePr = await verifySpecQuote({
      claim,
      maxAgeHours: 24,
      recordDir,
      fetchOptions: { fetchImpl: updatedFetch, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    __resetFetchSpecMemo();
    const recordedGoneNightly = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: updatedFetch, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(recordedGonePr.kind === 'result' && recordedGonePr.result.status).toBe('stale');
    expect(recordedGoneNightly.kind === 'result' && recordedGoneNightly.result.status).toBe('stale');
  });

  it('handles unanchored, domain-not-allowed, 404, and permanent 503 (unavailable)', async () => {
    const root = makeTempDir();
    const cacheDir = path.join(root, 'http-cache');
    const recordDir = path.join(root, 'records');

    const unanchored = await verifySpecQuote({
      claim: makeClaim({ anchor: UNANCHORED }),
      maxAgeHours: 0,
      recordDir,
    });
    expect(unanchored.kind === 'result' && unanchored.result.reason).toBe('unanchored');

    const disallowed = await verifySpecQuote({
      claim: makeClaim({ url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window' }),
      maxAgeHours: 0,
      recordDir,
    });
    expect(disallowed.kind === 'result' && disallowed.result.reason).toBe('domain-not-allowed');

    const fetch503 = (async () => makeResponse('down', { status: 503 })) as typeof fetch;
    const claim503 = makeClaim({ id: 'event-loop-tasks-microtasks/outage' });
    const outage = await verifySpecQuote({
      claim: claim503,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: fetch503, cacheDir, retries: 1, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(outage.kind).toBe('unavailable');

    const { artifact, unavailable } = buildSpecQuotesArtifact({
      outcomes: [{ claim: claim503, outcome: outage }],
      pageStatuses: new Map<string, PageProofStatus>([['event-loop-tasks-microtasks', 'proven']]),
      generatedAt: '2026-12-01T00:00:00Z',
    });
    expect(ProofArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(artifact.claims[claim503.id]).toBeUndefined();
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].claimId).toBe(claim503.id);
    expect(computeExitCode(artifact, true)).toBe(0);

    __resetFetchSpecMemo();
    const fetch404 = (async () => makeResponse('gone', { status: 404 })) as typeof fetch;
    const notFound = await verifySpecQuote({
      claim: makeClaim({ id: 'event-loop-tasks-microtasks/gone' }),
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl: fetch404, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(notFound.kind === 'result' && notFound.result.status).toBe('failed');
    expect(notFound.kind === 'result' && notFound.result.reason).toBe('fetch-error');
  });

  it('rejects spec records with unexpected fields like normativeText', async () => {
    const root = makeTempDir();
    const cacheDir = path.join(root, 'http-cache');
    const recordDir = path.join(root, 'records');
    const claim = makeClaim();
    const fetchImpl = (async () => makeResponse(whatwg, { url: claim.proof.url })) as typeof fetch;

    const found = await verifySpecQuote({
      claim,
      maxAgeHours: 0,
      recordDir,
      fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
    });
    expect(found.kind === 'result' && found.observed).toBeTruthy();
    if (found.kind === 'result' && found.observed) {
      recordObservedQuote(claim, found.observed, '2026-12-01', recordDir);
    }

    const filePath = specRecordPath(claim.proof.url, recordDir);
    const tampered = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    tampered.sections[claim.proof.anchor].normativeText = 'leaked spec body';
    fs.writeFileSync(filePath, JSON.stringify(tampered), 'utf-8');

    expect(() => readSpecRecord(claim.proof.url, recordDir)).toThrow();
  });

  it('prunes unreferenced quotes, sections, and files via pruneSpecRecords', async () => {
    const root = makeTempDir();
    const cacheDir = path.join(root, 'http-cache');
    const recordDir = path.join(root, 'records');
    const claim1 = makeClaim({ id: 'event-loop-tasks-microtasks/c1' });
    const claim2 = makeClaim({
      id: 'event-loop-tasks-microtasks/c2',
      quote: 'Let oldestMicrotask be the result of dequeuing from the event loop\'s microtask queue.',
    });
    const fetchImpl = (async () => makeResponse(whatwg, { url: claim1.proof.url })) as typeof fetch;

    for (const c of [claim1, claim2]) {
      const res = await verifySpecQuote({
        claim: c,
        maxAgeHours: 0,
        recordDir,
        fetchOptions: { fetchImpl, cacheDir, minIntervalMs: 0, sleep: async () => {} },
      });
      if (res.kind === 'result' && res.observed) {
        recordObservedQuote(c, res.observed, '2026-12-01', recordDir);
      }
    }

    const p1 = pruneSpecRecords([claim1], recordDir);
    expect(p1).toEqual({ removedFiles: 0, removedSections: 0, removedQuotes: 1 });

    const p2 = pruneSpecRecords([], recordDir);
    expect(p2).toEqual({ removedFiles: 1, removedSections: 1, removedQuotes: 1 });
  });

  it('computes exit codes correctly for strict and non-strict modes', () => {
    const claim = makeClaim();
    const failedOutcome = {
      kind: 'result' as const,
      observed: null,
      result: {
        claimId: claim.id,
        status: 'failed' as const,
        reason: 'quote-not-found',
        message: 'missing',
        details: {},
        checkedAt: '2026-12-01T00:00:00Z',
      },
    };

    const { artifact: enforcedArtifact } = buildSpecQuotesArtifact({
      outcomes: [{ claim, outcome: failedOutcome }],
      pageStatuses: new Map<string, PageProofStatus>([['event-loop-tasks-microtasks', 'proven']]),
      generatedAt: '2026-12-01T00:00:00Z',
    });
    expect(computeExitCode(enforcedArtifact, false)).toBe(0);
    expect(computeExitCode(enforcedArtifact, true)).toBe(1);

    const { artifact: unverifiedArtifact } = buildSpecQuotesArtifact({
      outcomes: [{ claim, outcome: failedOutcome }],
      pageStatuses: new Map<string, PageProofStatus>([['event-loop-tasks-microtasks', 'unverified']]),
      generatedAt: '2026-12-01T00:00:00Z',
    });
    expect(computeExitCode(unverifiedArtifact, true)).toBe(0);
  });

  it('CLI exits with code 2 on an invalid claims file', () => {
    const contentDir = makeTempDir('spec-cli-invalid-');
    fs.mkdirSync(path.join(contentDir, 'claims'), { recursive: true });
    fs.writeFileSync(
      path.join(contentDir, 'claims', 'broken-page.claims.json'),
      '{ "pageId": "broken-page", "claims": "not-an-array" }',
      'utf-8'
    );
    const outFile = path.join(contentDir, 'out.json');
    const res = spawnSync(
      'npx',
      ['tsx', 'scripts/proof/verify-spec-quotes.ts', '--out', outFile],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, FRONTEND_ROCKS_CONTENT_DIR: contentDir },
        encoding: 'utf-8',
      }
    );
    expect(res.status).toBe(2);
  });
});
