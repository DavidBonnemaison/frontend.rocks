import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'trusted-click',
  title: 'A real click is trusted, a scripted one is not',
  question: 'Does a listener see isTrusted true for a user click and false for element.click()?',
  kind: 'trace',
  fixture: {
    html: '<button id="target">Go</button>',
    js: `
const target = document.getElementById('target');
target.addEventListener('click', (e) => { if (window.__armed) window.__trace.push(e.isTrusted); });
/*@variant*/`,
  },
  variants: {
    treatment: {
      label: 'User click (replayed by the runner)',
      js: 'window.__armed = true;',
      input: [{ action: 'click', selector: '#target' }],
    },
    control: {
      label: 'Scripted element.click()',
      js: 'window.__armed = true; target.click();',
    },
  },
  mutation: { variant: 'treatment', remove: 'window.__armed = true;' },
  observe: (ctx) => ({ trusted: ctx.trace.slice() }),
  expect: {
    'user-click-is-trusted': { treatment: { trusted: [true] }, control: { trusted: [false] } },
  },
  viewport: { width: 400, height: 240 },
});
