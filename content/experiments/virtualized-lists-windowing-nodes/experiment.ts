import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'virtualized-lists-windowing-nodes',
  title: 'Windowing keeps list DOM node count constant',
  question: 'How many DOM nodes live inside the list container when rendering all 10,000 items vs a 30-row window?',
  kind: 'fixture',
  fixture: {
    html: `<div id="list"></div>`,
    js: `
const list = document.getElementById('list');
/*@variant*/
const frag = document.createDocumentFragment();
for (let i = 0; i < window.__rowCount; i++) {
  const row = document.createElement('div');
  row.className = 'row';
  row.textContent = 'Item ' + i;
  frag.appendChild(row);
}
list.appendChild(frag);`,
  },
  variants: {
    treatment: { label: 'Full 10,000-row render', js: `window.__rowCount = 10000;` },
    control: { label: '30-row virtualized window', js: `window.__rowCount = 30;` },
  },
  mutation: { variant: 'treatment', remove: `window.__rowCount = 10000;` },
  observe: (ctx) => {
    const list = ctx.doc.getElementById('list');
    if (!list) throw new Error('missing #list');
    return { listNodes: list.children.length };
  },
  expect: {
    'dom-node-count': {
      treatment: { listNodes: 10000 },
      control: { listNodes: 30 },
    },
  },
  viewport: { width: 640, height: 240 },
});
