import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'console-page-error',
  title: 'Console page error capture fixture',
  question: 'Does the page console capture record console.error messages?',
  kind: 'console',
  fixture: {
    html: '<p>console fixture</p>',
  },
  variants: {
    treatment: {
      label: 'Calls console.error',
      js: "console.error('boom');",
    },
    control: {
      label: 'Silent control',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: "console.error('boom');",
  },
  observe: (ctx) => ({
    errors: ctx.console.filter((e) => e.level === 'error').map((e) => e.text),
  }),
  expect: {
    'error-logged': {
      treatment: { errors: ['boom'] },
      control: { errors: [] },
    },
  },
});
