import { afterEach, describe, expect, it, vi } from 'vitest';
import { countServerEvent } from '../netlify/functions/lib/goatcounter-server';

describe('countServerEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is a no-op when credentials are missing', async () => {
    vi.stubEnv('GOATCOUNTER_WRITE_TOKEN', '');
    vi.stubEnv('GOATCOUNTER_SITE', '');
    const fetchImpl = vi.fn();

    await countServerEvent('mcp_call', 'check_claim', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts a single hit to /api/v0/count with bearer token and no_sessions', async () => {
    vi.stubEnv('GOATCOUNTER_WRITE_TOKEN', 'secret-token');
    vi.stubEnv('GOATCOUNTER_SITE', 'frontendrocks');

    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await countServerEvent('mcp_call', 'check_claim', { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://frontendrocks.goatcounter.com/api/v0/count');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      no_sessions: true,
      hits: [{ path: 'mcp_call/check_claim', title: 'mcp_call', event: true }],
    });
  });

  it('never throws when fetch rejects', async () => {
    vi.stubEnv('GOATCOUNTER_WRITE_TOKEN', 'secret-token');
    vi.stubEnv('GOATCOUNTER_SITE', 'frontendrocks');

    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      countServerEvent('mcp_call', 'check_claim', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
  });
});
