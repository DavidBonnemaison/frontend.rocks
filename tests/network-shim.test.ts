// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_SHIM_JS } from '@/lib/proof/runtime/network-shim-source';

interface ShimWindow extends Window {
  __frConfig?: {
    network: {
      routes: Array<{
        id: string;
        origin: 'self' | 'cross';
        method: string;
        path: string;
        status: number;
        headers?: Record<string, string>;
        body?: string;
        delayMs?: number;
      }>;
    };
  };
  __trace?: unknown[];
  __network?: unknown[];
}

function installShim(routes: NonNullable<ShimWindow['__frConfig']>['network']['routes']): void {
  const win = window as unknown as ShimWindow;
  win.__frConfig = { network: { routes } };
  win.__trace = [];
  win.__network = [];
  new Function(NETWORK_SHIM_JS)();
}

describe('network shim (NETWORK_SHIM_JS)', () => {
  const originalFetch = window.fetch;
  const originalXhr = window.XMLHttpRequest;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.fetch = originalFetch;
    window.XMLHttpRequest = originalXhr;
  });

  it('responds with status 201 after delayMs and records fetch:start then fetch:end', async () => {
    installShim([
      {
        id: 'create-a',
        origin: 'self',
        method: 'GET',
        path: '/api/a',
        status: 201,
        headers: { 'x-test': 'yes' },
        body: '{"ok":true}',
        delayMs: 300,
      },
    ]);

    let resolved = false;
    const promise = window.fetch('/api/a').then((res) => {
      resolved = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const res = await promise;
    expect(res.status).toBe(201);
    expect(res.headers.get('x-test')).toBe('yes');
    expect(await res.text()).toBe('{"ok":true}');

    const trace = (window as unknown as ShimWindow).__trace as Array<{ type: string; status?: number }>;
    expect(trace.map((e) => e.type)).toEqual(['fetch:start', 'fetch:end']);
    expect(trace[1].status).toBe(201);
  });

  it('strips /__api/<experiment-id> prefix and matches cross-origin routes', async () => {
    installShim([
      { id: 'self-items', origin: 'self', method: 'GET', path: '/items', status: 200, body: 'self' },
      { id: 'cross-items', origin: 'cross', method: 'GET', path: '/items', status: 200, body: 'cross' },
    ]);

    const p1 = window.fetch('/__api/demo-exp/items');
    const p2 = window.fetch('https://cross.test/__api/demo-exp/items');
    await vi.runAllTimersAsync();

    expect(await (await p1).text()).toBe('self');
    expect(await (await p2).text()).toBe('cross');
  });

  it('rejects unmatched URLs with FR_NO_ROUTE GET', async () => {
    installShim([]);
    await expect(window.fetch('/api/missing')).rejects.toThrow(/^FR_NO_ROUTE GET \/api\/missing/);
    const trace = (window as unknown as ShimWindow).__trace as Array<{ type: string }>;
    expect(trace.map((e) => e.type)).toEqual(['fetch:start', 'fetch:unmatched']);
  });

  it('rejects with AbortError when aborted during delay', async () => {
    installShim([
      { id: 'slow', origin: 'self', method: 'GET', path: '/api/a', status: 201, delayMs: 300 },
    ]);

    const controller = new AbortController();
    const promise = window.fetch('/api/a', { signal: controller.signal });
    const caught = promise.catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();

    const err = (await caught) as { name?: string };
    expect(err?.name).toBe('AbortError');
    const trace = (window as unknown as ShimWindow).__trace as Array<{ type: string }>;
    expect(trace.map((e) => e.type)).toEqual(['fetch:start', 'fetch:abort']);
  });

  it('supports XMLHttpRequest load and abort events with matching status and trace', async () => {
    installShim([
      {
        id: 'create-a',
        origin: 'self',
        method: 'GET',
        path: '/api/a',
        status: 201,
        body: 'created',
        delayMs: 300,
      },
    ]);

    const xhr = new window.XMLHttpRequest();
    let loadedStatus = 0;
    let loadedBody = '';
    xhr.addEventListener('load', () => {
      loadedStatus = xhr.status;
      loadedBody = xhr.responseText;
    });
    xhr.open('GET', '/api/a');
    xhr.send();

    await vi.advanceTimersByTimeAsync(300);
    expect(loadedStatus).toBe(201);
    expect(loadedBody).toBe('created');

    const trace = (window as unknown as ShimWindow).__trace as Array<{ type: string }>;
    expect(trace.map((e) => e.type)).toEqual(['xhr:start', 'xhr:end']);

    const xhr2 = new window.XMLHttpRequest();
    let aborted = false;
    xhr2.onabort = () => {
      aborted = true;
    };
    xhr2.open('GET', '/api/a');
    xhr2.send();
    await vi.advanceTimersByTimeAsync(50);
    xhr2.abort();
    expect(aborted).toBe(true);
    expect(trace.map((e) => e.type)).toEqual(['xhr:start', 'xhr:end', 'xhr:start', 'xhr:abort']);
  });
});
