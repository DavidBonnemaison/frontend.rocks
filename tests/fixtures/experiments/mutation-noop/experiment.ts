import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'mutation-noop',
  title: 'Mutation no-op fixture',
  question: 'Does a mutation removing an unrelated property fail anti-vacuity?',
  kind: 'fixture',
  fixture: {
    html: '<div class="box">sample</div>',
  },
  variants: {
    treatment: {
      label: 'Red box with unrelated outline',
      css: '.box { color: rgb(255, 0, 0); outline: 0px solid; }',
    },
    control: {
      label: 'Blue box',
      css: '.box { color: rgb(0, 0, 255); }',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: 'outline: 0px solid;',
  },
  observe: (ctx) => {
    const el = ctx.doc.querySelector('.box');
    if (!el) throw new Error('missing .box');
    return { color: ctx.win.getComputedStyle(el).color };
  },
  expect: {
    'box-color': {
      treatment: { color: 'rgb(255, 0, 0)' },
      control: { color: 'rgb(0, 0, 255)' },
    },
  },
});
