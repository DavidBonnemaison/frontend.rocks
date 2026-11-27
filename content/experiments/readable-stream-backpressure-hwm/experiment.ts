import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'readable-stream-backpressure-hwm',
  title: 'ReadableStream highWaterMark bounds eager pull() calls',
  question: 'How many chunks does a ReadableStream pull before a slow consumer reads when highWaterMark is 4 vs 20?',
  kind: 'fixture',
  fixture: {
    html: `<p>ReadableStream backpressure probe</p>`,
    js: `
window.__pullCount = 0;
window.__desiredSizes = [];
/*@variant*/
let produced = 0;
const stream = new ReadableStream(
  {
    pull(controller) {
      if (produced >= 12) {
        controller.close();
        return;
      }
      produced += 1;
      window.__pullCount += 1;
      controller.enqueue(produced);
      window.__desiredSizes.push(controller.desiredSize);
    },
  },
  new CountQueuingStrategy({ highWaterMark: window.__hwm })
);
window.__reader = stream.getReader();`,
  },
  variants: {
    treatment: { label: 'highWaterMark: 4', js: `window.__hwm = 4;` },
    control: { label: 'highWaterMark: 20', js: `window.__hwm = 20;` },
  },
  mutation: { variant: 'treatment', remove: `window.__hwm = 4;` },
  observe: async (ctx) => {
    await ctx.settle();
    const w = ctx.win as unknown as { __pullCount: number; __desiredSizes: number[] };
    const events = [
      {
        seq: 0,
        lane: 'producer',
        label: `pulls before first read: ${w.__pullCount}`,
        status: w.__pullCount <= 4 ? 'ok' : 'warn',
      },
      {
        seq: 1,
        lane: 'queue',
        label: `last desiredSize: ${w.__desiredSizes[w.__desiredSizes.length - 1] ?? -1}`,
        status: 'neutral',
      },
    ];
    return { events };
  },
  expect: {
    'hwm-bounds-pulls': {
      treatment: {
        events: [
          { seq: 0, lane: 'producer', label: 'pulls before first read: 4', status: 'ok' },
          { seq: 1, lane: 'queue', label: 'last desiredSize: 0', status: 'neutral' },
        ],
      },
      control: {
        events: [
          { seq: 0, lane: 'producer', label: 'pulls before first read: 12', status: 'warn' },
          { seq: 1, lane: 'queue', label: 'last desiredSize: 8', status: 'neutral' },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
