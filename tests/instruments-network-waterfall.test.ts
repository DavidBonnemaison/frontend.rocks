import { describe, expect, it } from 'vitest';
import {
  computeWaterfallDomain,
  NetworkObservedSchema,
  NetworkTraceSchema,
  summarizeNetworkRequests,
} from '@/components/instruments/network-waterfall/schema';
import {
  NETWORK_WATERFALL_ORDINAL,
  NETWORK_WATERFALL_TRACE,
} from '@/components/instruments/__fixtures__/network-waterfall';

describe('NetworkWaterfall utilities', () => {
  it('validates fixtures and groups identical method+path requests', () => {
    expect(NetworkObservedSchema.safeParse(NETWORK_WATERFALL_ORDINAL).success).toBe(true);
    expect(NetworkTraceSchema.safeParse(NETWORK_WATERFALL_TRACE).success).toBe(true);

    const summary = summarizeNetworkRequests(NETWORK_WATERFALL_ORDINAL.requests);
    expect(summary).toEqual([
      { key: 'POST /api/charge', method: 'POST', path: '/api/charge', count: 2 },
      { key: 'GET /api/receipt', method: 'GET', path: '/api/receipt', count: 1 },
    ]);
  });

  it('computes temporal domain including pending requests with end: null', () => {
    expect(computeWaterfallDomain(NETWORK_WATERFALL_TRACE)).toEqual([0, 58]);
    expect(computeWaterfallDomain([{ seq: 0, start: 10, end: null }])).toEqual([0, 10]);
    expect(computeWaterfallDomain(undefined)).toBeNull();
    expect(computeWaterfallDomain([])).toBeNull();
  });

  it('supports empty request arrays in ordinal mode', () => {
    expect(NetworkObservedSchema.safeParse({ requests: [] }).success).toBe(true);
    expect(summarizeNetworkRequests([])).toEqual([]);
  });
});
