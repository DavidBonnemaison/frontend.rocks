import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'cross-origin-isolation-headers',
  title: 'COOP and COEP response headers opt a document into isolation',
  question: 'Does serving Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy expose both isolation headers on the response?',
  kind: 'network',
  network: {
    mode: 'server',
    routes: [
      {
        id: 'isolated-doc',
        origin: 'self',
        method: 'GET',
        path: '/isolated',
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
        body: 'isolated',
      },
      {
        id: 'plain-doc',
        origin: 'self',
        method: 'GET',
        path: '/plain',
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'plain',
      },
    ],
  },
  fixture: {
    html: `<p>Cross-Origin Isolation header probe</p>`,
    js: `
window.__done = (async () => {
  /*@variant*/
  const res = await fetch(window.__targetUrl);
  window.__result = {
    status: res.status,
    coop: res.headers.get('cross-origin-opener-policy') || 'none',
    coep: res.headers.get('cross-origin-embedder-policy') || 'none',
  };
})();`,
  },
  variants: {
    treatment: {
      label: 'Response with COOP: same-origin & COEP: require-corp',
      js: `window.__targetUrl = window.__origins.self + '/__api/cross-origin-isolation-headers/isolated';`,
    },
    control: {
      label: 'Plain response without isolation headers',
      js: `window.__targetUrl = window.__origins.self + '/__api/cross-origin-isolation-headers/plain';`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `/isolated`,
  },
  observe: async (ctx) => {
    const w = ctx.win as unknown as {
      __done: Promise<void>;
      __result: { status: number; coop: string; coep: string };
    };
    await w.__done;
    const r = w.__result;
    return {
      requests: [
        {
          seq: 0,
          method: 'GET',
          path: '/doc',
          outcome: r.status,
          headers: {
            coop: r.coop,
            coep: r.coep,
          },
        },
      ],
    };
  },
  expect: {
    'coop-coep-headers-present': {
      treatment: {
        requests: [
          {
            seq: 0,
            method: 'GET',
            path: '/doc',
            outcome: 200,
            headers: {
              coop: 'same-origin',
              coep: 'require-corp',
            },
          },
        ],
      },
      control: {
        requests: [
          {
            seq: 0,
            method: 'GET',
            path: '/doc',
            outcome: 200,
            headers: {
              coop: 'none',
              coep: 'none',
            },
          },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
