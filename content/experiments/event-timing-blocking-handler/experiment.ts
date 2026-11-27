import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'event-timing-blocking-handler',
  title: 'A blocking click handler produces a slow Event Timing entry',
  question: 'Does a synchronous 150 ms click handler produce a PerformanceEventTiming entry of at least 104 ms?',
  kind: 'fixture',
  fixture: {
    html: `<button id="action-btn" type="button" style="padding:12px 20px;font-size:16px;">Trigger interaction</button>`,
    js: `
window.__longInteraction = false;
window.__supported = typeof PerformanceObserver !== 'undefined' &&
  Array.isArray(PerformanceObserver.supportedEntryTypes) &&
  PerformanceObserver.supportedEntryTypes.includes('event');
if (window.__supported) {
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'click' && entry.duration >= 104) {
        window.__longInteraction = true;
      }
    }
  });
  po.observe({ type: 'event', buffered: true, durationThreshold: 16 });
}
const btn = document.getElementById('action-btn');
/*@variant*/`,
  },
  variants: {
    treatment: {
      label: 'Synchronous 150 ms click handler',
      js: `
btn.addEventListener('click', () => {
  const end = performance.now() + 150;
  while (performance.now() < end) {}
  btn.textContent = 'Done';
});`,
      input: [
        { action: 'click', selector: '#action-btn' },
        { action: 'wait', ms: 60 },
      ],
    },
    control: {
      label: 'Yielding click handler (setTimeout)',
      js: `
btn.addEventListener('click', () => {
  btn.textContent = 'Queued';
  setTimeout(() => { btn.textContent = 'Done'; }, 0);
});`,
      input: [
        { action: 'click', selector: '#action-btn' },
        { action: 'wait', ms: 60 },
      ],
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `while (performance.now() < end) {}`,
  },
  observe: async (ctx) => {
    await ctx.settle();
    const w = ctx.win as unknown as { __longInteraction: boolean; __supported: boolean };
    if (!w.__supported) throw new Error('PerformanceEventTiming not supported');
    return {
      events: [
        { seq: 0, lane: 'input', label: 'trusted click on #action-btn', status: 'neutral' },
        {
          seq: 1,
          lane: 'event-timing',
          label: w.__longInteraction ? 'click duration >= 104 ms' : 'click duration < 104 ms',
          status: w.__longInteraction ? 'fail' : 'ok',
        },
      ],
    };
  },
  expect: {
    'blocking-click-slow': {
      treatment: {
        events: [
          { seq: 0, lane: 'input', label: 'trusted click on #action-btn', status: 'neutral' },
          { seq: 1, lane: 'event-timing', label: 'click duration >= 104 ms', status: 'fail' },
        ],
      },
      control: {
        events: [
          { seq: 0, lane: 'input', label: 'trusted click on #action-btn', status: 'neutral' },
          { seq: 1, lane: 'event-timing', label: 'click duration < 104 ms', status: 'ok' },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
