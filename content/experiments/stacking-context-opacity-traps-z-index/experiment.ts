import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'stacking-context-opacity-traps-z-index',
  title: 'opacity below 1 creates a stacking context',
  question: 'Does opacity: 0.99 on a parent trap a z-index: 9999 child behind a z-index: 10 header?',
  kind: 'fixture',
  fixture: {
    html: `<header id="header" class="header">Header (z-index: 10)</header>
<section id="parent" class="parent"><div id="tooltip" class="tooltip">Tooltip (z-index: 9999)</div></section>`,
    css: `
body { margin: 0; font-family: sans-serif; }
.header { position: relative; z-index: 10; height: 60px; background: #c7d2fe; }
.tooltip { position: relative; z-index: 9999; margin-top: -40px; height: 40px; width: 240px; background: #fca5a5; }`,
  },
  variants: {
    treatment: { label: 'Parent has opacity: 0.99', css: `.parent { opacity: 0.99; }` },
    control: { label: 'Parent without opacity', css: `.parent { /* no stacking context */ }` },
  },
  mutation: { variant: 'treatment', remove: 'opacity: 0.99;' },
  observe: (ctx) => {
    const parent = ctx.doc.getElementById('parent');
    if (!parent) throw new Error('missing #parent');
    const op = Number(ctx.win.getComputedStyle(parent).opacity);
    const traps = op < 1;
    const hit = ctx.doc.elementFromPoint(100, 40);
    return {
      nodes: [
        { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
        { id: 'parent', label: 'Parent', zIndex: 'auto', createsStackingContext: traps, parent: null, topLayer: false },
        { id: 'tooltip', label: 'Tooltip', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: false },
      ],
      probe: { hitId: hit ? hit.id : null },
    };
  },
  expect: {
    'opacity-traps-tooltip': {
      treatment: {
        nodes: [
          { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
          { id: 'parent', label: 'Parent', zIndex: 'auto', createsStackingContext: true, parent: null, topLayer: false },
          { id: 'tooltip', label: 'Tooltip', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: false },
        ],
        probe: { hitId: 'header' },
      },
      control: {
        nodes: [
          { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
          { id: 'parent', label: 'Parent', zIndex: 'auto', createsStackingContext: false, parent: null, topLayer: false },
          { id: 'tooltip', label: 'Tooltip', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: false },
        ],
        probe: { hitId: 'tooltip' },
      },
    },
  },
  viewport: { width: 800, height: 320 },
});
