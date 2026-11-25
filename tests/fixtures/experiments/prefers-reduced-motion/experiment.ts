import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'prefers-reduced-motion',
  title: 'prefers-reduced-motion follows the user setting',
  question: 'Does a (prefers-reduced-motion: reduce) rule apply only when the user asks for reduced motion?',
  kind: 'fixture',
  fixture: { html: '<div class="box"></div>', css: '.box { width: 100px; height: 10px; }' },
  variants: {
    treatment: {
      label: 'Stylesheet with a reduced-motion rule',
      css: '@media (prefers-reduced-motion: reduce) { .box { width: 10px; } }',
    },
    control: { label: 'No reduced-motion rule' },
  },
  mutation: { variant: 'treatment', remove: '.box { width: 10px; }' },
  observe: (ctx) => {
    const box = ctx.doc.querySelector('.box');
    if (!box) throw new Error('missing .box');
    return { width: Math.round(box.getBoundingClientRect().width) };
  },
  expect: {
    'rule-applies-when-reduced': {
      emulation: { reducedMotion: 'reduce' },
      treatment: { width: 10 },
      control: { width: 100 },
    },
    'rule-ignored-otherwise': {
      emulation: { reducedMotion: 'no-preference' },
      treatment: { width: 100 },
      control: { width: 100 },
    },
  },
  viewport: { width: 400, height: 240 },
});
