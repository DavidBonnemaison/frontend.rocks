import type { NetworkObserved, NetworkTrace } from '../network-waterfall/schema';

export const NETWORK_WATERFALL_ORDINAL: NetworkObserved = {
  requests: [
    {
      seq: 0,
      method: 'POST',
      path: '/api/charge',
      outcome: 200,
      headers: { 'Content-Type': 'application/json' },
    },
    {
      seq: 1,
      method: 'POST',
      path: '/api/charge',
      outcome: 200,
      headers: { 'Content-Type': 'application/json' },
    },
    {
      seq: 2,
      method: 'GET',
      path: '/api/receipt',
      outcome: 'pending',
    },
  ],
};

export const NETWORK_WATERFALL_TRACE: NetworkTrace = [
  { seq: 0, start: 4, end: 42 },
  { seq: 1, start: 18, end: 58 },
  { seq: 2, start: 44, end: null },
];

export const NETWORK_WATERFALL_COMPARE: NetworkObserved = {
  requests: [
    {
      seq: 0,
      method: 'POST',
      path: '/api/charge',
      outcome: 200,
      headers: { 'Idempotency-Key': 'ord-9481' },
    },
    {
      seq: 1,
      method: 'GET',
      path: '/api/receipt',
      outcome: 200,
    },
  ],
};
