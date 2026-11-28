import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'device-pixel-ratio-subpixel-sandbox',
  title: 'Snapping CSS offsets to devicePixelRatio aligns to physical pixels',
  question: 'Does snapping a 0.25 CSS px offset using window.devicePixelRatio align the stroke onto integer physical pixels?',
  kind: 'fixture',
  fixture: {
    html: `<div id="probe" class="probe">1 CSS px stroke</div>`,
    css: `body { margin: 0; } .probe { width: 100px; height: 20px; background: #38bdf8; }`,
    js: `
const rawOffset = 0.25;
const dpr = window.devicePixelRatio || 1;
/*@variant*/`,
  },
  variants: {
    treatment: {
      label: 'Snapped to integer device pixels via devicePixelRatio',
      js: `window.__effOffset = Math.round(rawOffset * dpr) / dpr;`,
    },
    control: {
      label: 'Unsnapped fractional CSS pixel offset (0.25 px)',
      js: `window.__effOffset = rawOffset;`,
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `Math.round(rawOffset * dpr) / dpr`,
  },
  observe: (ctx) => {
    const dpr = ctx.win.devicePixelRatio;
    const eff = (ctx.win as unknown as { __effOffset: number }).__effOffset;
    const phys = eff * dpr;
    const aligned = Math.abs(phys - Math.round(phys)) < 0.001;
    return { dpr, alignedToDevicePixel: aligned };
  },
  expect: {
    'dpr-1': {
      emulation: { deviceScaleFactor: 1 },
      treatment: { dpr: 1, alignedToDevicePixel: true },
      control: { dpr: 1, alignedToDevicePixel: false },
    },
    'dpr-2': {
      emulation: { deviceScaleFactor: 2 },
      treatment: { dpr: 2, alignedToDevicePixel: true },
      control: { dpr: 2, alignedToDevicePixel: false },
    },
    'dpr-3': {
      emulation: { deviceScaleFactor: 3 },
      treatment: { dpr: 3, alignedToDevicePixel: true },
      control: { dpr: 3, alignedToDevicePixel: false },
    },
  },
  viewport: { width: 400, height: 240 },
});
