import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/deploy-succeeded.mjs';

type FetchCall = { url: string; body?: string };

function stubFetch(pending: unknown, calls: FetchCall[], pendingStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body === undefined ? undefined : String(init.body) });
      if (url.endsWith('/indexnow-pending.json')) {
        return new Response(JSON.stringify(pending), { status: pendingStatus });
      }
      return new Response('', { status: 200 });
    }),
  );
}

const deployEvent = (context: string) =>
  new Request('https://frontend.rocks/.netlify/functions/deploy-succeeded', {
    method: 'POST',
    body: JSON.stringify({ payload: { id: 'd1', context } }),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('deploy-succeeded function', () => {
  it('sends the URLs of the pending file to IndexNow after a production deploy', async () => {
    vi.stubEnv('INDEXNOW_KEY', 'secret-key');
    const calls: FetchCall[] = [];
    stubFetch({ commit: 'abc', urls: ['https://frontend.rocks/concepts/live/'] }, calls);

    const res = await handler(deployEvent('production'));

    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('https://frontend.rocks/indexnow-pending.json');
    const indexNow = calls.find((c) => c.url === 'https://api.indexnow.org/indexnow');
    expect(indexNow).toBeDefined();
    expect(JSON.parse(indexNow!.body!).urlList).toEqual(['https://frontend.rocks/concepts/live/']);
    expect(JSON.parse(indexNow!.body!).key).toBe('secret-key');
  });

  it('does nothing for a deploy that is not production', async () => {
    vi.stubEnv('INDEXNOW_KEY', 'secret-key');
    const calls: FetchCall[] = [];
    stubFetch({ commit: 'abc', urls: ['https://frontend.rocks/'] }, calls);

    await handler(deployEvent('deploy-preview'));

    expect(calls).toEqual([]);
  });

  it('does not call IndexNow when the pending file is missing or invalid', async () => {
    vi.stubEnv('INDEXNOW_KEY', 'secret-key');
    const missing: FetchCall[] = [];
    stubFetch({}, missing, 404);
    expect((await handler(deployEvent('production'))).status).toBe(200);
    expect(missing.map((c) => c.url)).toEqual(['https://frontend.rocks/indexnow-pending.json']);

    const invalid: FetchCall[] = [];
    stubFetch({ nope: true }, invalid);
    await handler(deployEvent('production'));
    expect(invalid.map((c) => c.url)).toEqual(['https://frontend.rocks/indexnow-pending.json']);
  });

  it('skips the submission when the key is not set', async () => {
    vi.stubEnv('INDEXNOW_KEY', '');
    const calls: FetchCall[] = [];
    stubFetch({ commit: 'abc', urls: ['https://frontend.rocks/'] }, calls);

    await handler(deployEvent('production'));

    expect(calls.some((c) => c.url.includes('api.indexnow.org'))).toBe(false);
  });
});
