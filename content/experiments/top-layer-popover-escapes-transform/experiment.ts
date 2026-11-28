import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'top-layer-popover-escapes-transform',
  title: 'Top-layer popover escapes parent transform stacking context',
  question: 'Does showPopover() paint above a z-index: 10 header even when nested inside a transformed parent?',
  kind: 'fixture',
  fixture: {
    html: `<header id="header" class="header">Header (z-index: 10)</header>
<section id="parent" class="parent"><div id="menu" class="menu" popover="manual">Menu</div></section>`,
    css: `
body { margin: 0; font-family: sans-serif; }
.header { position: relative; z-index: 10; height: 60px; background: #c7d2fe; }
.parent { transform: translateZ(0); }
.menu { position: fixed; inset: 10px auto auto 20px; margin: 0; width: 220px; height: 48px; padding: 0; border: 0; background: #86efac; z-index: 9999; }`,
  },
  variants: {
    treatment: {
      label: 'Opened in the top layer with showPopover()',
      js: `const m = document.getElementById('menu'); if (m && typeof m.showPopover === 'function') m.showPopover();`,
    },
    control: {
      label: 'Shown inline with display: block inside transform parent',
      js: `const m = document.getElementById('menu'); if (m) { m.removeAttribute('popover'); m.style.display = 'block'; }`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `if (m && typeof m.showPopover === 'function') m.showPopover();`,
  },
  observe: (ctx) => {
    const menu = ctx.doc.getElementById('menu');
    const isTopLayer = Boolean(menu && menu.matches(':popover-open'));
    const hit = ctx.doc.elementFromPoint(100, 30);
    return {
      nodes: [
        { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
        { id: 'parent', label: 'Transformed parent', zIndex: 'auto', createsStackingContext: true, parent: null, topLayer: false },
        { id: 'menu', label: 'Menu', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: isTopLayer },
      ],
      probe: { hitId: hit ? hit.id : null },
    };
  },
  expect: {
    'popover-beats-header': {
      treatment: {
        nodes: [
          { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
          { id: 'parent', label: 'Transformed parent', zIndex: 'auto', createsStackingContext: true, parent: null, topLayer: false },
          { id: 'menu', label: 'Menu', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: true },
        ],
        probe: { hitId: 'menu' },
      },
      control: {
        nodes: [
          { id: 'header', label: 'Header', zIndex: 10, createsStackingContext: true, parent: null, topLayer: false },
          { id: 'parent', label: 'Transformed parent', zIndex: 'auto', createsStackingContext: true, parent: null, topLayer: false },
          { id: 'menu', label: 'Menu', zIndex: 9999, createsStackingContext: true, parent: 'parent', topLayer: false },
        ],
        probe: { hitId: 'header' },
      },
    },
  },
  viewport: { width: 800, height: 320 },
});
