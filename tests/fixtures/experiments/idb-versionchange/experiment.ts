import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'idb-versionchange',
  title: 'Closing on versionchange unblocks IndexedDB upgrade',
  question: 'Does closing the existing IndexedDB connection in versionchange unblock an upgrade request?',
  kind: 'trace',
  host: 'origin',
  fixture: {
    html: '<p>IndexedDB versionchange fixture</p>',
    js: `
const dbName = 'fr-idb-versionchange-test';
const req1 = indexedDB.open(dbName, 1);
req1.onsuccess = () => {
  const db1 = req1.result;
  window.__db1 = db1;
  db1.onversionchange = () => {
    window.__trace.push('versionchange');
    /*@variant*/
  };
  const req2 = indexedDB.open(dbName, 2);
  req2.onblocked = () => {
    window.__trace.push('blocked');
    window.__idbDone = true;
  };
  req2.onupgradeneeded = () => {
    window.__trace.push('upgradeneeded');
  };
  req2.onsuccess = () => {
    window.__trace.push('v2-open');
    req2.result.close();
    window.__idbDone = true;
  };
};`,
  },
  variants: {
    treatment: {
      label: 'First connection closes in versionchange',
      js: 'db1.close();',
    },
    control: {
      label: 'First connection stays open',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: 'db1.close();',
  },
  observe: async (ctx) => {
    const win = ctx.win as Window & { __idbDone?: boolean; __db1?: IDBDatabase };
    for (let i = 0; i < 40 && !win.__idbDone; i += 1) {
      await new Promise((resolve) => ctx.win.setTimeout(resolve, 25));
    }
    const events = ctx.trace.slice();
    if (win.__db1) {
      try {
        win.__db1.close();
      } catch {
        // Ignore close errors on already-closed connections.
      }
    }
    return { events };
  },
  expect: {
    'close-unblocks-upgrade': {
      treatment: { events: ['versionchange', 'upgradeneeded', 'v2-open'] },
      control: { events: ['versionchange', 'blocked'] },
    },
  },
  viewport: { width: 400, height: 240 },
});
