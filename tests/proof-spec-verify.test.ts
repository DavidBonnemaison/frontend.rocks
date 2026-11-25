import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'specs');

function makeResponse(body: string, init: { status?: number; headers?: Record<string, string>; url?: string } = {}): Response {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: init.headers,
  });
  if (init.url) {
    Object.defineProperty(res, 'url', { value: init.url });
  }
  return res;
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
    const unrendered = fs.readFileSync(path.join(FIXTURES_DIR, 'respec-unrendered.html'), 'utf-8');
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
