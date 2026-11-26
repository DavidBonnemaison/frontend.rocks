import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'react-vendor-render',
  title: 'Local React vendor bundle renders into the fixture',
  question: 'Does a fixture with vendor react and react-dom render a React element without external network access?',
  kind: 'fixture',
  vendor: ['react', 'react-dom'],
  fixture: {
    html: '<div id="root"></div>',
  },
  variants: {
    treatment: {
      label: 'Render paragraph with ReactDOM.flushSync',
      js: "ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('p', { id: 'out' }, 'rendered')));",
    },
    control: {
      label: 'Do not render with React',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: "ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('p', { id: 'out' }, 'rendered')));",
  },
  observe: (ctx) => ({
    text: ctx.doc.getElementById('out')?.textContent ?? null,
  }),
  expect: {
    'renders-element': {
      treatment: { text: 'rendered' },
      control: { text: null },
    },
  },
  viewport: { width: 400, height: 240 },
});
