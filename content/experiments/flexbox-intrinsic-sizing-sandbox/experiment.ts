import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'flexbox-intrinsic-sizing-sandbox',
  title: 'min-width: 0 lets a flex item shrink below its unbreakable child',
  question: 'Does min-width: 0 prevent a flex item with unbreakable text from overflowing its container?',
  kind: 'fixture',
  fixture: {
    html: `<div class="flex-row" id="row"><aside class="sidebar">Sidebar</aside><main class="main-col" id="main"><div class="unbreakable">immutable-chunk-hash-8f3c2b19a0-bundle-artifact-v2.js</div></main></div>`,
    css: `
body { margin: 0; font-family: monospace; }
.flex-row { display: flex; gap: 8px; width: 310px; border: 2px dashed #f87171; padding: 8px; box-sizing: border-box; }
.sidebar { flex: 0 0 84px; background: #cbd5e1; padding: 8px; box-sizing: border-box; }
.main-col { flex: 1 var(--flexShrink) 0%; background: #bae6fd; padding: 8px; box-sizing: border-box; }
.unbreakable { width: var(--contentWidth); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #1e293b; color: #f8fafc; padding: 4px; }`,
  },
  params: {
    flexShrink: { kind: 'range', label: 'flex-shrink', min: 0, max: 1, step: 1, default: 1 },
    contentWidth: { kind: 'range', label: 'Unbreakable child width', min: 140, max: 360, step: 20, default: 300, unit: 'px' },
  },
  variants: {
    treatment: { label: 'Flex item has min-width: 0', css: `.main-col { min-width: 0; } .unbreakable { max-width: 100%; }` },
    control: { label: 'Default min-width: auto', css: `.main-col { min-width: auto; }` },
  },
  mutation: { variant: 'treatment', remove: 'min-width: 0;' },
  observe: (ctx) => {
    const row = ctx.doc.getElementById('row');
    const main = ctx.doc.getElementById('main');
    if (!row || !main) throw new Error('missing elements');
    const overflows = row.scrollWidth > row.clientWidth + 1;
    return {
      root: {
        id: 'row',
        label: 'Flex row (.flex-row)',
        display: ctx.win.getComputedStyle(row).display,
        flags: overflows ? ['overflows'] : ['contained'],
        children: [
          {
            id: 'main',
            label: 'Main flex item',
            display: ctx.win.getComputedStyle(main).display,
            flags: overflows ? ['exceeds-container'] : ['shrunk-to-fit'],
            children: [],
          },
        ],
      },
    };
  },
  expect: {
    'min-width-zero-stops-overflow': {
      params: { flexShrink: 1, contentWidth: 300 },
      treatment: {
        root: {
          id: 'row',
          label: 'Flex row (.flex-row)',
          display: 'flex',
          flags: ['contained'],
          children: [
            {
              id: 'main',
              label: 'Main flex item',
              display: 'block',
              flags: ['shrunk-to-fit'],
              children: [],
            },
          ],
        },
      },
      control: {
        root: {
          id: 'row',
          label: 'Flex row (.flex-row)',
          display: 'flex',
          flags: ['overflows'],
          children: [
            {
              id: 'main',
              label: 'Main flex item',
              display: 'block',
              flags: ['exceeds-container'],
              children: [],
            },
          ],
        },
      },
    },
  },
  viewport: { width: 640, height: 240 },
});
