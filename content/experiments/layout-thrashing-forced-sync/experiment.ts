import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'layout-thrashing-forced-sync',
  title: 'Interleaved DOM writes and layout reads force synchronous reflows',
  question: 'How much slower is alternating style writes with offsetHeight reads than batching reads and writes?',
  kind: 'measured',
  fixture: {
    html: `<div id="list"></div>`,
    css: `
#list { display: flex; flex-direction: column; gap: 2px; }
.row { height: 14px; width: 120px; background: #cbd5e1; }`,
    js: `
const list = document.getElementById('list');
for (let i = 0; i < 160; i++) {
  const el = document.createElement('div');
  el.className = 'row';
  list.appendChild(el);
}
window.__runPass = () => {
  const rows = list.children;
  /*@variant*/
};`,
  },
  variants: {
    treatment: {
      label: 'Interleaved write then offsetHeight read',
      js: `
let total = 0;
for (let i = 0; i < rows.length; i++) {
  rows[i].style.width = (100 + (i % 40)) + 'px';
  total += rows[i].offsetHeight;
}
return total;`,
    },
    control: {
      label: 'Batched reads then batched writes',
      js: `
let total = 0;
const heights = [];
for (let i = 0; i < rows.length; i++) {
  heights.push(rows[i].offsetHeight);
}
for (let i = 0; i < rows.length; i++) {
  rows[i].style.width = (100 + (i % 40)) + 'px';
  total += heights[i];
}
return total;`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `total += rows[i].offsetHeight;`,
  },
  measured: { repeat: 15, metric: 'durationMs', minRatio: 1.5 },
  observe: (ctx) => {
    const fn = (ctx.win as unknown as { __runPass: () => number }).__runPass;
    const t0 = ctx.win.performance.now();
    let acc = 0;
    for (let r = 0; r < 3; r++) acc += fn();
    const durationMs = ctx.win.performance.now() - t0;
    return acc >= 0 ? durationMs : 0;
  },
  expect: {
    'forced-reflow-costs-more': { treatment: null, control: null },
  },
  viewport: { width: 640, height: 320 },
});
