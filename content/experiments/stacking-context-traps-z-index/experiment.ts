import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'stacking-context-traps-z-index',
  title: 'opacity traps a z-index: 9999 child',
  question: 'Can a tooltip with z-index: 9999 paint above a header with z-index: 10 when its parent has opacity below 1?',
  kind: 'fixture',
  fixture: {
    html: `<header class="header" data-probe="header">Header (z-index: 10)</header>
<section class="parent"><div class="tooltip" data-probe="tooltip">Tooltip (z-index: 9999)</div></section>`,
    css: `
.header { position: relative; z-index: 10; height: 60px; background: #c7d2fe; }
.tooltip { position: relative; z-index: 9999; margin-top: -40px; height: 40px; width: 240px; background: #fca5a5; }`,
  },
  variants: {
    treatment: { label: 'Parent has opacity: 0.99', css: `.parent { opacity: 0.99; }` },
    control: { label: 'Parent without opacity' },
  },
  mutation: { variant: 'treatment', remove: 'opacity: 0.99;' },
  observe: (ctx) => {
    const hit = ctx.doc.elementFromPoint(100, 40);
    return { topmost: hit ? hit.getAttribute('data-probe') : null };
  },
  expect: {
    'opacity-traps-tooltip-under-header': { treatment: { topmost: 'header' }, control: { topmost: 'tooltip' } },
  },
  viewport: { width: 800, height: 400 },
});
