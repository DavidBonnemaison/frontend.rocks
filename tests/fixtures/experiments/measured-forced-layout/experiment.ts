import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'measured-forced-layout',
  title: 'Forced synchronous layout vs batched writes',
  question: 'Does interleaving style writes and offsetWidth reads cost at least 2x more than batching?',
  kind: 'measured',
  measured: {
    repeat: 15,
    metric: 'workload duration (ms)',
    minRatio: 2,
  },
  fixture: {
    html: '<div id="list"></div>',
    css: '.row { height: 12px; margin: 1px 0; background: #ccc; }',
    js: `
const list = document.getElementById('list');
const rows = [];
for (let i = 0; i < 200; i++) {
  const d = document.createElement('div');
  d.className = 'row';
  d.style.width = '100px';
  list.appendChild(d);
  rows.push(d);
}
window.__workload = function () {
  let pad = '';
  for (let i = 0; i < 200000; i++) pad += 'a';
  let sum = pad.length;
  if (window.__interleave === true) {
    for (let i = 0; i < 400; i++) {
      const row = rows[i % rows.length];
      row.style.width = (100 + (i % 50)) + 'px';
      sum += row.offsetWidth;
    }
  } else {
    for (let i = 0; i < 400; i++) {
      const row = rows[i % rows.length];
      row.style.width = (100 + (i % 50)) + 'px';
    }
    sum += rows[0].offsetWidth;
  }
  return sum;
};
`,
  },
  variants: {
    treatment: {
      label: 'Interleaved writes and reads',
      js: 'window.__interleave = true;',
    },
    control: {
      label: 'Batched writes then single read',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: 'window.__interleave = true;',
  },
  observe: (ctx) => {
    const t0 = performance.now();
    (ctx.win as unknown as { __workload: () => number }).__workload();
    return performance.now() - t0;
  },
  expect: {
    'interleaved-slower': {
      treatment: null,
      control: null,
    },
  },
});
