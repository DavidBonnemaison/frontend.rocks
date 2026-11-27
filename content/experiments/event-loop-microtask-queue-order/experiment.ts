import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'event-loop-microtask-queue-order',
  title: 'Microtasks drain before the next macrotask',
  question: 'Does queueMicrotask run before an already-scheduled 0 ms setTimeout?',
  kind: 'trace',
  fixture: {
    html: `<p>Event loop queue order trace</p>`,
    js: `
let seq = 0;
window.__trace.push({ seq: seq++, op: 'run-start', queue: 'task', label: 'sync-script' });
setTimeout(() => {
  window.__trace.push({ seq: seq++, op: 'run-start', queue: 'task', label: 'timer-0ms' });
}, 0);
/*@variant*/
window.__trace.push({ seq: seq++, op: 'run-end', queue: 'task', label: 'sync-script' });`,
  },
  variants: {
    treatment: {
      label: 'Scheduled with queueMicrotask',
      js: `queueMicrotask(() => { window.__trace.push({ seq: seq++, op: 'run-start', queue: 'microtask', label: 'queued-second' }); });`,
    },
    control: {
      label: 'Scheduled with setTimeout(0)',
      js: `setTimeout(() => { window.__trace.push({ seq: seq++, op: 'run-start', queue: 'task', label: 'queued-second' }); }, 0);`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `queueMicrotask(() => { window.__trace.push({ seq: seq++, op: 'run-start', queue: 'microtask', label: 'queued-second' }); });`,
  },
  observe: (ctx) => ({ events: ctx.trace.slice() }),
  expect: {
    'microtask-beats-timer': {
      treatment: {
        events: [
          { seq: 0, op: 'run-start', queue: 'task', label: 'sync-script' },
          { seq: 1, op: 'run-end', queue: 'task', label: 'sync-script' },
          { seq: 2, op: 'run-start', queue: 'microtask', label: 'queued-second' },
          { seq: 3, op: 'run-start', queue: 'task', label: 'timer-0ms' },
        ],
      },
      control: {
        events: [
          { seq: 0, op: 'run-start', queue: 'task', label: 'sync-script' },
          { seq: 1, op: 'run-end', queue: 'task', label: 'sync-script' },
          { seq: 2, op: 'run-start', queue: 'task', label: 'timer-0ms' },
          { seq: 3, op: 'run-start', queue: 'task', label: 'queued-second' },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
