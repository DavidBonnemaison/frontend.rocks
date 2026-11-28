import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'abortsignal-cleans-detached-listeners',
  title: 'Unremoved window listeners keep firing after subtree removal',
  question: 'Does a window resize listener keep firing after its subtree is removed unless aborted via AbortSignal?',
  kind: 'fixture',
  fixture: {
    html: `<div id="mount"><div id="widget">Widget</div></div>`,
    js: `
const mount = document.getElementById('mount');
const widget = document.getElementById('widget');
window.__callsAfterUnmount = 0;
let unmounted = false;
const ac = new AbortController();
/*@variant*/
mount.removeChild(widget);
unmounted = true;
window.dispatchEvent(new Event('resize'));
window.dispatchEvent(new Event('resize'));`,
  },
  variants: {
    treatment: {
      label: 'Listener registered without AbortSignal cleanup',
      js: `
window.addEventListener('resize', () => {
  if (unmounted) window.__callsAfterUnmount += 1;
});`,
    },
    control: {
      label: 'Listener cleaned up with AbortController.abort()',
      js: `
window.addEventListener('resize', () => {
  if (unmounted) window.__callsAfterUnmount += 1;
}, { signal: ac.signal });
ac.abort();`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `if (unmounted) window.__callsAfterUnmount += 1;`,
  },
  observe: (ctx) => {
    const count = (ctx.win as unknown as { __callsAfterUnmount: number }).__callsAfterUnmount;
    return {
      events: [
        { seq: 0, lane: 'lifecycle', label: 'subtree removed from DOM', status: 'neutral' },
        {
          seq: 1,
          lane: 'listener',
          label: `resize calls after unmount: ${count}`,
          status: count > 0 ? 'fail' : 'ok',
        },
      ],
    };
  },
  expect: {
    'detached-listener-fires': {
      treatment: {
        events: [
          { seq: 0, lane: 'lifecycle', label: 'subtree removed from DOM', status: 'neutral' },
          { seq: 1, lane: 'listener', label: 'resize calls after unmount: 2', status: 'fail' },
        ],
      },
      control: {
        events: [
          { seq: 0, lane: 'lifecycle', label: 'subtree removed from DOM', status: 'neutral' },
          { seq: 1, lane: 'listener', label: 'resize calls after unmount: 0', status: 'ok' },
        ],
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
