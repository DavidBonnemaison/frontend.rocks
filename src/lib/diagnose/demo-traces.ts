import type { DiagnoseInputFormat } from './types';

export interface DemoTracePreset {
  id: 'layout-thrashing-loop' | 'network-waterfall-bundle' | 'main-thread-long-task';
  title: string;
  fileName: string;
  format: DiagnoseInputFormat;
  badge: string;
  description: string;
  payload: string;
}

const LAYOUT_THRASHING_TRACE = {
  traceEvents: [
    {
      name: 'RunTask',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'X',
      ts: 1000000,
      dur: 148000, // 148 ms
      pid: 1,
      tid: 1,
    },
    ...Array.from({ length: 8 }, (_, idx) => ({
      name: idx % 2 === 0 ? 'UpdateLayoutTree' : 'Layout',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: 1005000 + idx * 14000,
      dur: 11500 + idx * 1200, // 11.5 ms .. 19.9 ms
      pid: 1,
      tid: 1,
      args: {
        beginData: {
          stackTrace: [
            {
              functionName: 'measureAndResizeCards',
              url: 'https://app.example.com/assets/grid-layout.js',
              lineNumber: 142 + idx,
              columnNumber: 18,
            },
          ],
        },
      },
    })),
    {
      name: 'Paint',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: 1130000,
      dur: 24400, // 24.4 ms (> 16.6 ms)
      pid: 1,
      tid: 1,
    },
    {
      name: 'CompositeLayers',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: 1155000,
      dur: 19200, // 19.2 ms (> 16.6 ms)
      pid: 1,
      tid: 1,
    },
  ],
};

const NETWORK_WATERFALL_HAR = {
  log: {
    version: '1.2',
    entries: [
      {
        startedDateTime: '2026-04-01T12:00:00.000Z',
        time: 180,
        request: { method: 'GET', url: 'https://shop.example.com/' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-cache' }],
          content: { size: 18400, mimeType: 'text/html' },
        },
      },
      {
        startedDateTime: '2026-04-01T12:00:00.195Z',
        time: 260,
        request: { method: 'GET', url: 'https://shop.example.com/assets/app.bundle.js' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-store' }],
          content: { size: 942000, mimeType: 'application/javascript' },
        },
        _initiator: { type: 'parser', url: 'https://shop.example.com/' },
      },
      {
        startedDateTime: '2026-04-01T12:00:00.470Z',
        time: 210,
        request: { method: 'GET', url: 'https://shop.example.com/assets/theme.css' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-store' }],
          content: { size: 185000, mimeType: 'text/css' },
        },
        _initiator: { type: 'script', url: 'https://shop.example.com/assets/app.bundle.js' },
      },
      {
        startedDateTime: '2026-04-01T12:00:00.700Z',
        time: 310,
        request: { method: 'GET', url: 'https://shop.example.com/api/bootstrap-config' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'private, max-age=0' }],
          content: { size: 4200, mimeType: 'application/json' },
        },
        _initiator: { type: 'script', url: 'https://shop.example.com/assets/theme.css' },
      },
      {
        startedDateTime: '2026-04-01T12:00:01.030Z',
        time: 240,
        request: { method: 'GET', url: 'https://shop.example.com/api/cart-items' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-store' }],
          content: { size: 12400, mimeType: 'application/json' },
        },
        _initiator: { type: 'script', url: 'https://shop.example.com/api/bootstrap-config' },
      },
      {
        startedDateTime: '2026-04-01T12:00:02.100Z',
        time: 145,
        request: { method: 'POST', url: 'https://shop.example.com/api/checkout' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-store' }],
          content: { size: 420, mimeType: 'application/json' },
        },
      },
      {
        startedDateTime: '2026-04-01T12:00:02.142Z',
        time: 152,
        request: { method: 'POST', url: 'https://shop.example.com/api/checkout' },
        response: {
          status: 200,
          headers: [{ name: 'Cache-Control', value: 'no-store' }],
          content: { size: 420, mimeType: 'application/json' },
        },
      },
    ],
  },
};

const MAIN_THREAD_LONG_TASK_TRACE = {
  traceEvents: [
    {
      name: 'RunTask',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'X',
      ts: 2000000,
      dur: 342500, // 342.5 ms (critical > 200 ms)
      pid: 1,
      tid: 1,
    },
    {
      name: 'RunTask',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'X',
      ts: 2400000,
      dur: 118400, // 118.4 ms
      pid: 1,
      tid: 1,
    },
    {
      name: 'MajorGC',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: 2530000,
      dur: 64200, // 64.2 ms (critical > 50 ms)
      pid: 1,
      tid: 1,
    },
    {
      name: 'MinorGC',
      cat: 'devtools.timeline',
      ph: 'X',
      ts: 2610000,
      dur: 23800, // 23.8 ms (> 20 ms)
      pid: 1,
      tid: 1,
    },
  ],
};

export const DEMO_TRACES: DemoTracePreset[] = [
  {
    id: 'layout-thrashing-loop',
    title: 'Layout Thrashing Loop',
    fileName: 'demo-layout-thrashing.json',
    format: 'chrome-trace',
    badge: 'Chrome Trace (.json)',
    description:
      'Repeated synchronous UpdateLayoutTree / Layout reads interleaved with DOM writes plus a 24.4 ms Paint overflow.',
    payload: JSON.stringify(LAYOUT_THRASHING_TRACE),
  },
  {
    id: 'network-waterfall-bundle',
    title: 'Network Waterfall & Uncompressed Bundle',
    fileName: 'demo-network-waterfall.har',
    format: 'har',
    badge: 'HTTP Archive (.har)',
    description:
      '5-level sequential request waterfall, static JS/CSS served with Cache-Control: no-store, and duplicate POST /api/checkout within 42 ms.',
    payload: JSON.stringify(NETWORK_WATERFALL_HAR),
  },
  {
    id: 'main-thread-long-task',
    title: 'Main-Thread Long Task',
    fileName: 'demo-main-thread-long-task.json',
    format: 'chrome-trace',
    badge: 'Chrome Trace (.json)',
    description:
      '342.5 ms blocking RunTask exceeding the 200 ms INP budget followed by a 64.2 ms stop-the-world MajorGC pause.',
    payload: JSON.stringify(MAIN_THREAD_LONG_TASK_TRACE),
  },
];
