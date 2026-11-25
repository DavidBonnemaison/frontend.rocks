import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'sw-waiting',
  title: 'skipWaiting bypasses the waiting service worker state',
  question: 'Does calling self.skipWaiting() during install activate a new service worker immediately instead of waiting?',
  kind: 'trace',
  host: 'origin',
  serviceWorker: `self.addEventListener('install', () => {
  const url = new URL(self.location.href);
  if (url.searchParams.get('skip') === '1') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
`,
  fixture: {
    html: '<p>Service Worker waiting fixture</p>',
    js: `
/*@variant*/
(async () => {
  const sw = navigator.serviceWorker;
  const reg1 = await sw.register('./sw.js?v=1', { scope: './' });
  await sw.ready;
  if (!sw.controller) {
    await new Promise((resolve) => {
      const onChange = () => {
        sw.removeEventListener('controllerchange', onChange);
        resolve();
      };
      sw.addEventListener('controllerchange', onChange);
      setTimeout(resolve, 1500);
    });
  }
  const skip = window.__swSkip || '0';
  const reg2 = await sw.register('./sw.js?v=2&skip=' + skip, { scope: './' });
  const incoming = reg2.installing || reg2.waiting;
  if (incoming && incoming.state !== 'activated') {
    await new Promise((resolve) => {
      const check = () => {
        if (incoming.state === 'activated' || (incoming.state === 'installed' && skip !== '1')) {
          resolve();
        }
      };
      incoming.addEventListener('statechange', check);
      check();
      setTimeout(resolve, 1500);
    });
  }
  window.__trace.push(reg2.waiting ? 'waiting' : 'activated');
  window.__swDone = true;
})();`,
  },
  variants: {
    treatment: {
      label: 'New worker calls self.skipWaiting() in install',
      js: "window.__swSkip = '1';",
    },
    control: {
      label: 'New worker does not call skipWaiting()',
      js: "window.__swSkip = '0';",
    },
  },
  mutation: {
    variant: 'treatment',
    remove: "window.__swSkip = '1';",
  },
  observe: async (ctx) => {
    const win = ctx.win as Window & { __swDone?: boolean };
    for (let i = 0; i < 60 && !win.__swDone; i += 1) {
      await new Promise((resolve) => ctx.win.setTimeout(resolve, 50));
    }
    return { outcome: ctx.trace[0] ?? null };
  },
  expect: {
    'skip-waiting-activates-immediately': {
      treatment: { outcome: 'activated' },
      control: { outcome: 'waiting' },
    },
  },
  viewport: { width: 400, height: 240 },
});
