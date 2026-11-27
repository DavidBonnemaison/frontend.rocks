import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'block-formatting-context-sandbox',
  title: 'display: flow-root encloses floats and stops top-margin collapse',
  question: 'Does display: flow-root on a parent enclose a floated child and trap its first child margin-top?',
  kind: 'fixture',
  fixture: {
    html: `<div class="outer-frame"><div class="bfc-parent" id="parent"><div class="floated-box" id="float">float: left</div><div class="first-child" id="first">First child</div></div></div>`,
    css: `
body { margin: 0; font-family: sans-serif; }
.outer-frame { position: relative; border-top: 1px solid #334155; padding: 0 10px 12px; min-height: 210px; }
.bfc-parent { background: rgba(56, 189, 248, 0.12); padding: 0 10px; }
.floated-box { float: left; width: 100px; height: var(--floatChild); margin: 8px 12px 8px 0; background: #fb923c; }
.first-child { margin-top: var(--childMarginTop); padding: 8px 10px; background: #a78bfa; }`,
  },
  params: {
    floatChild: { kind: 'range', label: 'Floated child height', min: 40, max: 140, step: 20, default: 100, unit: 'px' },
    childMarginTop: { kind: 'range', label: 'First child margin-top', min: 0, max: 48, step: 8, default: 24, unit: 'px' },
  },
  variants: {
    treatment: { label: 'Parent has display: flow-root', css: `.bfc-parent { display: flow-root; }` },
    control: { label: 'Parent has display: block', css: `.bfc-parent { display: block; }` },
  },
  mutation: { variant: 'treatment', remove: 'display: flow-root;' },
  observe: (ctx) => {
    const parent = ctx.doc.getElementById('parent');
    const flt = ctx.doc.getElementById('float');
    const first = ctx.doc.getElementById('first');
    if (!parent || !flt || !first) throw new Error('missing elements');
    const pr = parent.getBoundingClientRect();
    const fr = flt.getBoundingClientRect();
    const containsFloat = pr.bottom >= fr.bottom - 1;
    const marginCollapsesThrough = parent.offsetTop > 4;
    const flags: string[] = [];
    if (containsFloat) flags.push('contains-float');
    if (marginCollapsesThrough) flags.push('margin-collapses-through');
    return {
      root: {
        id: 'parent',
        label: 'Parent (.bfc-parent)',
        display: ctx.win.getComputedStyle(parent).display,
        flags,
        children: [
          { id: 'float', label: 'Floated box', display: 'block', flags: ['float-left'], children: [] },
          { id: 'first', label: 'First child', display: 'block', flags: [], children: [] },
        ],
      },
    };
  },
  expect: {
    'encloses-float-and-margin': {
      params: { floatChild: 100, childMarginTop: 24 },
      treatment: {
        root: {
          id: 'parent',
          label: 'Parent (.bfc-parent)',
          display: 'flow-root',
          flags: ['contains-float'],
          children: [
            { id: 'float', label: 'Floated box', display: 'block', flags: ['float-left'], children: [] },
            { id: 'first', label: 'First child', display: 'block', flags: [], children: [] },
          ],
        },
      },
      control: {
        root: {
          id: 'parent',
          label: 'Parent (.bfc-parent)',
          display: 'block',
          flags: ['margin-collapses-through'],
          children: [
            { id: 'float', label: 'Floated box', display: 'block', flags: ['float-left'], children: [] },
            { id: 'first', label: 'First child', display: 'block', flags: [], children: [] },
          ],
        },
      },
    },
  },
  viewport: { width: 640, height: 280 },
});
