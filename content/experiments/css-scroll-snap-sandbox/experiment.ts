import { defineExperiment } from '@/lib/proof/define-experiment';

export default defineExperiment({
  id: 'css-scroll-snap-sandbox',
  title: 'Mandatory scroll-snap forces alignment after a mid-slide scroll',
  question: 'When scrolled halfway between two slides, does scroll-snap-type: x mandatory snap to a slide edge while proximity rests in between?',
  kind: 'fixture',
  fixture: {
    html: `<div class="track" id="track"><article class="slide" id="s1">01</article><article class="slide" id="s2">02</article><article class="slide" id="s3">03</article><article class="slide" id="s4">04</article></div>`,
    css: `
body { margin: 0; }
.track { display: flex; gap: 0; width: 220px; overflow-x: auto; scroll-padding-inline-start: var(--scrollPadding); }
.slide { flex: 0 0 200px; height: 120px; scroll-snap-align: start; background: #e2e8f0; border-right: 1px solid #94a3b8; box-sizing: border-box; }`,
  },
  params: {
    scrollPadding: { kind: 'range', label: 'scroll-padding-inline-start', min: 0, max: 32, step: 8, default: 0, unit: 'px' },
  },
  variants: {
    treatment: { label: 'scroll-snap-type: x mandatory', css: `.track { scroll-snap-type: x mandatory; }` },
    control: { label: 'scroll-snap-type: x proximity', css: `.track { scroll-snap-type: x proximity; }` },
  },
  mutation: { variant: 'treatment', remove: 'scroll-snap-type: x mandatory;' },
  observe: async (ctx) => {
    const track = ctx.doc.getElementById('track');
    if (!track) throw new Error('missing #track');
    track.scrollTo({ left: 110, behavior: 'instant' as ScrollBehavior });
    await ctx.settle();
    const slides = Array.from(ctx.doc.querySelectorAll('.slide'));
    const tr = track.getBoundingClientRect();
    let alignedId: string | null = null;
    for (const s of slides) {
      const sr = s.getBoundingClientRect();
      if (Math.abs(sr.left - tr.left) <= 2) {
        alignedId = s.id;
        break;
      }
    }
    return { alignedSlide: alignedId, snapped: alignedId !== null };
  },
  expect: {
    'mandatory-snaps-midpoint': {
      params: { scrollPadding: 0 },
      treatment: { alignedSlide: 's2', snapped: true },
      control: { alignedSlide: null, snapped: false },
    },
  },
  viewport: { width: 400, height: 240 },
});
