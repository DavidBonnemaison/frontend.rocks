import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'long-task-yield-main-thread',
  title: 'Yielding between chunks cuts the longest main-thread stall',
  question: 'Does breaking a busy loop into macrotask chunks reduce the longest uninterrupted main-thread block?',
  kind: 'measured',
  fixture: {
    html: `<div id="status">Ready</div>`,
    js: `
window.__busyMs = (ms) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {}
};
window.__runWork = async () => {
  /*@variant*/
};`,
  },
  variants: {
    treatment: {
      label: 'Single uninterrupted 20 ms block',
      js: `
const t0 = performance.now();
window.__busyMs(20);
return performance.now() - t0;`,
    },
    control: {
      label: 'Ten 2 ms chunks yielding with setTimeout(0)',
      js: `
let maxChunk = 0;
for (let i = 0; i < 10; i++) {
  const s = performance.now();
  window.__busyMs(2);
  const d = performance.now() - s;
  if (d > maxChunk) maxChunk = d;
  await new Promise((r) => setTimeout(r, 0));
}
return maxChunk;`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `window.__busyMs(20);`,
  },
  measured: { repeat: 15, metric: 'maxBlockMs', minRatio: 2 },
  observe: async (ctx) => {
    const fn = (ctx.win as unknown as { __runWork: () => Promise<number> }).__runWork;
    return await fn();
  },
  expect: {
    'single-block-stalls-longer': { treatment: null, control: null },
  },
  viewport: { width: 640, height: 240 },
});
