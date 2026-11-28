import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'virtualized-lists-windowing-cost',
  title: 'Rendering 10,000 rows vs a 30-row window multiplies layout cost',
  question: 'How much more does a forced layout cost with 10,000 rendered DOM rows than with a 30-row window?',
  kind: 'measured',
  fixture: {
    html: `<div id="viewport"><div id="list"></div></div>`,
    css: `
#viewport { width: 400px; height: 240px; overflow: auto; }
.row { height: 24px; border-bottom: 1px solid #e2e8f0; padding: 0 8px; }`,
    js: `
const list = document.getElementById('list');
/*@variant*/
for (let i = 0; i < window.__rowCount; i++) {
  const row = document.createElement('div');
  row.className = 'row';
  row.textContent = 'Row ' + i;
  list.appendChild(row);
}`,
  },
  variants: {
    treatment: { label: 'All 10,000 rows in the DOM', js: `window.__rowCount = 10000;` },
    control: { label: 'Virtualized 30-row window', js: `window.__rowCount = 30;` },
  },
  mutation: { variant: 'treatment', remove: `window.__rowCount = 10000;` },
  measured: { repeat: 15, metric: 'layoutMs', minRatio: 3 },
  observe: (ctx) => {
    const vp = ctx.doc.getElementById('viewport');
    if (!vp) throw new Error('missing #viewport');
    const t0 = ctx.win.performance.now();
    let acc = 0;
    for (let i = 0; i < 6; i++) {
      vp.style.width = i % 2 === 0 ? '380px' : '400px';
      acc += vp.scrollHeight;
    }
    const elapsed = ctx.win.performance.now() - t0;
    return acc >= 0 ? elapsed : 0;
  },
  expect: {
    'full-list-layout-slower': { treatment: null, control: null },
  },
  viewport: { width: 640, height: 300 },
});
