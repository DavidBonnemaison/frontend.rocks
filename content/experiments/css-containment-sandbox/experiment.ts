import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'css-containment-sandbox',
  title: 'CSS contain: layout, paint, and size each isolate a different subsystem',
  question: 'How do contain: layout, contain: paint, and contain: size change fixed positioning, overflow hit-testing, and intrinsic height?',
  kind: 'fixture',
  fixture: {
    html: `<div class="stage"><div class="card" id="card"><span class="overflow-badge" id="badge">Badge</span><div class="card-body">Normal flow copy inside the card.</div><div class="fixed-chip" id="chip">Fixed chip</div></div></div>`,
    css: `
body { margin: 0; font-family: sans-serif; }
.stage { position: relative; padding: 30px 24px; min-height: 200px; }
.card { position: relative; width: 240px; padding: 12px; border: 2px solid #38bdf8; }
.overflow-badge { position: absolute; top: 8px; right: -30px; width: 24px; height: 24px; background: #fb923c; }
.fixed-chip { position: fixed; top: 0; left: 0; width: 80px; height: 24px; background: #a78bfa; }`,
    js: `
const mode = (window.__params && window.__params.contain) || 'layout';
document.documentElement.setAttribute('data-contain', String(mode));`,
  },
  params: {
    contain: { kind: 'select', label: 'contain value', options: ['layout', 'paint', 'size'], default: 'layout' },
  },
  variants: {
    treatment: {
      label: 'Card applies selected contain value',
      css: `
:root[data-contain="layout"] .card { contain: layout; }
:root[data-contain="paint"] .card { contain: paint; }
:root[data-contain="size"] .card { contain: size; }`,
    },
    control: {
      label: 'Card has contain: none',
      css: `.card { contain: none; }`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `:root[data-contain="layout"] .card { contain: layout; }`,
  },
  observe: (ctx) => {
    const card = ctx.doc.getElementById('card');
    const chip = ctx.doc.getElementById('chip');
    const badge = ctx.doc.getElementById('badge');
    if (!card || !chip || !badge) throw new Error('missing elements');
    const cr = card.getBoundingClientRect();
    const chr = chip.getBoundingClientRect();
    const br = badge.getBoundingClientRect();
    const hit = ctx.doc.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    const fixedTrapped = Math.abs(chr.top - cr.top) < 6 && Math.abs(chr.left - cr.left) < 6;
    const badgeClipped = !hit || hit.id !== 'badge';
    const collapsedToZero = cr.height < 36;
    const flags: string[] = [];
    if (fixedTrapped) flags.push('fixed-trapped');
    if (badgeClipped) flags.push('paint-clipped');
    if (collapsedToZero) flags.push('collapsed-to-zero');
    return {
      root: {
        id: 'card',
        label: 'Card (.card)',
        display: ctx.win.getComputedStyle(card).display,
        flags,
        children: [],
      },
    };
  },
  expect: {
    'contain-layout-traps-fixed': {
      params: { contain: 'layout' },
      treatment: {
        root: { id: 'card', label: 'Card (.card)', display: 'block', flags: ['fixed-trapped'], children: [] },
      },
      control: {
        root: { id: 'card', label: 'Card (.card)', display: 'block', flags: [], children: [] },
      },
    },
    'contain-paint-clips-overflow': {
      params: { contain: 'paint' },
      treatment: {
        root: {
          id: 'card',
          label: 'Card (.card)',
          display: 'block',
          flags: ['fixed-trapped', 'paint-clipped'],
          children: [],
        },
      },
      control: {
        root: { id: 'card', label: 'Card (.card)', display: 'block', flags: [], children: [] },
      },
    },
    'contain-size-collapses-height': {
      params: { contain: 'size' },
      treatment: {
        root: { id: 'card', label: 'Card (.card)', display: 'block', flags: ['collapsed-to-zero'], children: [] },
      },
      control: {
        root: { id: 'card', label: 'Card (.card)', display: 'block', flags: [], children: [] },
      },
    },
  },
  viewport: { width: 640, height: 280 },
});
