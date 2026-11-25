import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'microtasks-before-timers',
  title: 'A promise reaction beats an earlier 0 ms timer',
  question: 'If a timer is queued first and a promise reaction second, which callback runs first?',
  kind: 'trace',
  fixture: {
    html: `<p>Open the trace below.</p>`,
    js: `
window.__trace.push('sync-start');
setTimeout(() => window.__trace.push('timer-queued-first'), 0);
/*@variant*/
window.__trace.push('sync-end');`,
  },
  variants: {
    treatment: {
      label: 'Second callback queued as a promise reaction',
      js: `Promise.resolve().then(() => window.__trace.push('callback-queued-second'));`,
    },
    control: {
      label: 'Second callback queued as another 0 ms timer',
      js: `setTimeout(() => window.__trace.push('callback-queued-second'), 0);`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `Promise.resolve().then(() => window.__trace.push('callback-queued-second'));`,
  },
  observe: (ctx) => ({ order: ctx.trace.slice() }),
  expect: {
    'promise-reaction-runs-before-earlier-timer': {
      treatment: { order: ['sync-start', 'sync-end', 'callback-queued-second', 'timer-queued-first'] },
      control: { order: ['sync-start', 'sync-end', 'timer-queued-first', 'callback-queued-second'] },
    },
  },
});
