import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'network-shim-abort',
  title: 'Aborted fetch never resolves',
  question: 'Does an aborted fetch reject instead of delivering its late response?',
  kind: 'network',
  network: {
    mode: 'shim',
    routes: [
      {
        id: 'slow-items',
        origin: 'self',
        method: 'GET',
        path: '/items',
        status: 200,
        body: '[1,2,3]',
        delayMs: 200,
      },
    ],
  },
  fixture: {
    html: '<p>network fixture</p>',
    js: `
const controller = new AbortController();
fetch(window.__origins.self + '/__api/network-shim-abort/items', { signal: controller.signal })
  .then(() => window.__trace.push('resolved'))
  .catch((e) => window.__trace.push('rejected:' + e.name));
/*@variant*/`,
  },
  variants: {
    treatment: { label: 'Abort after 50 ms', js: `setTimeout(() => controller.abort(), 50);` },
    control: { label: 'Never aborted' },
  },
  mutation: { variant: 'treatment', remove: 'setTimeout(() => controller.abort(), 50);' },
  observe: async (ctx) => {
    await new Promise((resolve) => ctx.win.setTimeout(resolve, 400));
    return { outcome: ctx.trace.filter((t) => typeof t === 'string') };
  },
  expect: {
    'abort-rejects': {
      treatment: { outcome: ['rejected:AbortError'] },
      control: { outcome: ['resolved'] },
    },
  },
});
