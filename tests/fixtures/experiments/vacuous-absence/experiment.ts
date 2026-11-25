import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'vacuous-absence',
  title: 'Vacuous absence check fixture',
  question: 'Does checking absence of a control-only node fail anti-vacuity?',
  kind: 'fixture',
  fixture: {
    html: '<div class="root">baseline</div>',
  },
  variants: {
    treatment: {
      label: 'No-op CSS rule',
      css: '.noop { color: red; }',
    },
    control: {
      label: 'Control-only element',
      html: '<div class="control-only"></div>',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: 'color: red;',
  },
  observe: (ctx) => ({
    found: !ctx.doc.querySelector('.control-only'),
  }),
  expect: {
    'absence-check': {
      treatment: { found: true },
      control: { found: false },
    },
  },
});
