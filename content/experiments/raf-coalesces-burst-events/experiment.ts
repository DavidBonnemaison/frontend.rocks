import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'raf-coalesces-burst-events',
  title: 'requestAnimationFrame coalesces a burst of pointermove events',
  question: 'When 50 pointermove events fire in one task, how many times does a rAF-coalesced handler run vs a direct handler?',
  kind: 'fixture',
  fixture: {
    html: `<div id="stage">Pointer burst target</div>`,
    js: `
const target = document.getElementById('stage');
window.__workRuns = 0;
window.__pending = false;
/*@variant*/
for (let i = 0; i < 50; i++) {
  target.dispatchEvent(new Event('pointermove'));
}`,
  },
  variants: {
    treatment: {
      label: 'Coalesced with requestAnimationFrame',
      js: `
target.addEventListener('pointermove', () => {
  if (window.__pending) return;
  window.__pending = true;
  requestAnimationFrame(() => {
    window.__pending = false;
    window.__workRuns += 1;
  });
});`,
    },
    control: {
      label: 'Direct synchronous handler',
      js: `
target.addEventListener('pointermove', () => {
  window.__workRuns += 1;
});`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `if (window.__pending) return;`,
  },
  observe: async (ctx) => {
    await ctx.settle();
    const runs = (ctx.win as unknown as { __workRuns: number }).__workRuns;
    return {
      events: [
        { seq: 0, lane: 'input', label: '50 pointermove events', status: 'neutral' },
        {
          seq: 1,
          lane: 'work',
          label: `expensive work ran ${runs}x`,
          status: runs <= 1 ? 'ok' : 'warn',
        },
      ],
    };
  },
  expect: {
    'coalesces-50-events': {
      treatment: {
        events: [
          { seq: 0, lane: 'input', label: '50 pointermove events', status: 'neutral' },
          { seq: 1, lane: 'work', label: 'expensive work ran 1x', status: 'ok' },
        ],
      },
      control: {
        events: [
          { seq: 0, lane: 'input', label: '50 pointermove events', status: 'neutral' },
          { seq: 1, lane: 'work', label: 'expensive work ran 50x', status: 'warn' },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
