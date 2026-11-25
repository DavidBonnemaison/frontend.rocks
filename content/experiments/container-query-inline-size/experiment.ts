import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'container-query-inline-size',
  title: '@container reads the container, not the viewport',
  question: 'Does the card switch to two columns when its slot is wide, while the viewport never changes?',
  kind: 'fixture',
  fixture: {
    html: `<div class="slot"><article class="card"><div class="media">IMG</div><p>Body copy</p></article></div>`,
    css: `
.slot { width: var(--w); }
.card { display: grid; grid-template-columns: 1fr; gap: 8px; }
@container (min-width: 420px) {
  .card { grid-template-columns: 160px 1fr; }
}`,
  },
  params: {
    w: { kind: 'range', label: 'Slot width', min: 220, max: 640, step: 20, default: 480, unit: 'px' },
  },
  variants: {
    treatment: { label: 'Slot declares container-type: inline-size', css: `.slot { container-type: inline-size; }` },
    control: { label: 'No container declared' },
  },
  mutation: { variant: 'treatment', remove: 'container-type: inline-size;' },
  observe: (ctx) => {
    const card = ctx.doc.querySelector('.card');
    if (!card) throw new Error('missing .card');
    const tracks = ctx.win.getComputedStyle(card).gridTemplateColumns.trim().split(/\s+/);
    return { columns: tracks.length };
  },
  expect: {
    'two-columns-at-480': { params: { w: 480 }, treatment: { columns: 2 }, control: { columns: 1 } },
    'one-column-at-300': { params: { w: 300 }, treatment: { columns: 1 }, control: { columns: 1 } },
  },
  viewport: { width: 1280, height: 800 },
});
