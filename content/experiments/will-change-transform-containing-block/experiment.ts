import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'will-change-transform-containing-block',
  title: 'will-change: transform traps position: fixed descendants',
  question: 'Does will-change: transform make a parent the containing block for a position: fixed child?',
  kind: 'fixture',
  fixture: {
    html: `<div class="spacer"></div>
<section id="parent" class="parent"><div id="fixed" class="fixed">Fixed child</div></section>`,
    css: `
body { margin: 0; }
.spacer { height: 100px; }
.parent { position: relative; margin-left: 80px; width: 300px; height: 120px; background: #e2e8f0; }
.fixed { position: fixed; top: 0; left: 0; width: 120px; height: 32px; background: #38bdf8; }`,
  },
  variants: {
    treatment: { label: 'Parent declares will-change: transform', css: `.parent { will-change: transform; }` },
    control: { label: 'Parent without will-change' },
  },
  mutation: { variant: 'treatment', remove: 'will-change: transform;' },
  observe: (ctx) => {
    const parent = ctx.doc.getElementById('parent');
    const fixed = ctx.doc.getElementById('fixed');
    if (!parent || !fixed) throw new Error('missing elements');
    const pr = parent.getBoundingClientRect();
    const fr = fixed.getBoundingClientRect();
    const relativeToParent = Math.abs(fr.top - pr.top) < 2 && Math.abs(fr.left - pr.left) < 2;
    return {
      root: {
        id: 'parent',
        label: 'Parent (.parent)',
        display: ctx.win.getComputedStyle(parent).display,
        flags: relativeToParent ? ['containing-block'] : [],
        children: [
          {
            id: 'fixed',
            label: 'Child (position: fixed)',
            display: ctx.win.getComputedStyle(fixed).display,
            flags: relativeToParent ? ['fixed-relative-to-parent'] : ['fixed-relative-to-viewport'],
            children: [],
          },
        ],
      },
    };
  },
  expect: {
    'traps-fixed-child': {
      treatment: {
        root: {
          id: 'parent',
          label: 'Parent (.parent)',
          display: 'block',
          flags: ['containing-block'],
          children: [
            {
              id: 'fixed',
              label: 'Child (position: fixed)',
              display: 'block',
              flags: ['fixed-relative-to-parent'],
              children: [],
            },
          ],
        },
      },
      control: {
        root: {
          id: 'parent',
          label: 'Parent (.parent)',
          display: 'block',
          flags: [],
          children: [
            {
              id: 'fixed',
              label: 'Child (position: fixed)',
              display: 'block',
              flags: ['fixed-relative-to-viewport'],
              children: [],
            },
          ],
        },
      },
    },
  },
  viewport: { width: 640, height: 300 },
});
