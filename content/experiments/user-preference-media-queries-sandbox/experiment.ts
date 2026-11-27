import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'user-preference-media-queries-sandbox',
  title: 'User preference media queries respond to real OS / engine settings',
  question: 'Do @media rules for prefers-reduced-motion, prefers-color-scheme, and forced-colors change computed styles under real emulation?',
  kind: 'fixture',
  fixture: {
    html: `<div class="surface" id="surface"><span class="dot" id="dot"></span><button type="button" id="btn">Action</button></div>`,
    css: `
body { margin: 0; }
.surface { padding: 16px; background: rgb(255, 255, 255); color: rgb(15, 23, 42); }
.dot { display: inline-block; width: 12px; height: 12px; animation: pulse 1s infinite; }
@keyframes pulse { from { opacity: 0.4; } to { opacity: 1; } }`,
  },
  variants: {
    treatment: {
      label: 'CSS declares user-preference @media rules',
      css: `
@media (prefers-reduced-motion: reduce) { .dot { animation-name: none; } }
@media (prefers-color-scheme: dark) { .surface { background: rgb(17, 24, 39); color: rgb(248, 250, 252); } }
@media (forced-colors: active) { .surface { border: 2px solid CanvasText; } }`,
    },
    control: {
      label: 'No user-preference @media rules',
    },
  },
  mutation: {
    variant: 'treatment',
    remove: `@media (prefers-reduced-motion: reduce) { .dot { animation-name: none; } }`,
  },
  observe: (ctx) => {
    const dot = ctx.doc.getElementById('dot');
    const surface = ctx.doc.getElementById('surface');
    if (!dot || !surface) throw new Error('missing elements');
    const animName = ctx.win.getComputedStyle(dot).animationName;
    const bg = ctx.win.getComputedStyle(surface).backgroundColor;
    return {
      prefersReducedMotion: ctx.win.matchMedia('(prefers-reduced-motion: reduce)').matches,
      prefersDark: ctx.win.matchMedia('(prefers-color-scheme: dark)').matches,
      forcedColors: ctx.win.matchMedia('(forced-colors: active)').matches,
      animationDisabled: animName === 'none',
      darkSurfaceApplied: bg === 'rgb(17, 24, 39)',
    };
  },
  expect: {
    'reduced-motion-and-dark': {
      emulation: { reducedMotion: 'reduce', colorScheme: 'dark', forcedColors: 'none' },
      treatment: {
        prefersReducedMotion: true,
        prefersDark: true,
        forcedColors: false,
        animationDisabled: true,
        darkSurfaceApplied: true,
      },
      control: {
        prefersReducedMotion: true,
        prefersDark: true,
        forcedColors: false,
        animationDisabled: false,
        darkSurfaceApplied: false,
      },
    },
  },
  viewport: { width: 400, height: 240 },
});
