import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'wrong-expectation',
  title: 'Wrong expectation fixture',
  question: 'Does a wrong expected color report fail without being vacuous?',
  kind: 'fixture',
  fixture: {
    html: '<div class="box">sample</div>',
  },
  variants: {
    treatment: {
      label: 'Red box',
      css: '.box { color: rgb(255, 0, 0); }',
    },
    control: {
      label: 'Blue box',
      css: '.box { color: rgb(0, 0, 255); }',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: 'color: rgb(255, 0, 0);',
  },
  observe: (ctx) => {
    const el = ctx.doc.querySelector('.box');
    if (!el) throw new Error('missing .box');
    return { color: ctx.win.getComputedStyle(el).color };
  },
  expect: {
    'box-color': {
      treatment: { color: 'rgb(0, 128, 0)' },
      control: { color: 'rgb(0, 0, 255)' },
    },
  },
});
