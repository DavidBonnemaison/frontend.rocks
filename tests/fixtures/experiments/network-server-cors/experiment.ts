import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'network-server-cors',
  title: 'Cross-origin fetch requires Access-Control-Allow-Origin',
  question: 'Does the browser expose a cross-origin response only when Access-Control-Allow-Origin is sent?',
  kind: 'network',
  network: {
    mode: 'server',
    routes: [
      {
        id: 'data-open',
        origin: 'cross',
        method: 'GET',
        path: '/data-open',
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '{"ok":true}',
      },
      {
        id: 'data-closed',
        origin: 'cross',
        method: 'GET',
        path: '/data-closed',
        status: 200,
        body: '{"ok":true}',
      },
    ],
  },
  fixture: {
    html: '<p>cors fixture</p>',
    js: `
/*@variant*/
fetch(window.__origins.cross + '/__api/network-server-cors/' + window.__path)
  .then(() => window.__trace.push('ok'), (e) => window.__trace.push('blocked:' + e.name));`,
  },
  variants: {
    treatment: {
      label: 'Route with Access-Control-Allow-Origin',
      js: `window.__path = 'data-open';`,
    },
    control: {
      label: 'Route without CORS header',
      js: `window.__path = 'data-closed';`,
    },
  },
  mutation: { variant: 'treatment', remove: `window.__path = 'data-open';` },
  observe: async (ctx) => {
    await new Promise((resolve) => ctx.win.setTimeout(resolve, 300));
    return { outcome: ctx.trace.filter((t) => typeof t === 'string') };
  },
  expect: {
    'cors-header-required': {
      treatment: { outcome: ['ok'] },
      control: { outcome: ['blocked:TypeError'] },
    },
  },
});
