import { describe, expect, it } from 'vitest';
import { renderSchematic } from '@/lib/design/schematic';
import type { GeometrySnapshot } from '@/lib/design/schematic-snapshot';

const SAMPLE_SNAPSHOT: GeometrySnapshot = {
  id: 'cq-480',
  source: {
    experimentId: 'container-query-inline-size',
    variant: 'treatment',
    params: { w: 480 },
  },
  engine: { name: 'chromium', version: '143.0.0.0' },
  viewport: { width: 1280, height: 800 },
  boxes: [
    { key: 'slot', label: '.slot', x: 0, y: 0, w: 480, h: 120, dashed: true },
    { key: 'card', label: '.card', x: 0, y: 0, w: 480, h: 120 },
    { key: 'media', label: '.media', x: 0, y: 0, w: 160, h: 120, highlight: true },
    { key: 'p', label: 'p', x: 168, y: 0, w: 312, h: 120 },
  ],
  dimensions: [{ from: [0, 0], to: [480, 0], label: '480 px' }],
  caption: 'Container at 480 px — Measured in Chromium 143.0.0.0',
  sourceHash: 'sample-hash',
};

describe('renderSchematic', () => {
  it('is byte-identical across repeated calls', () => {
    const a = renderSchematic({ snapshot: SAMPLE_SNAPSHOT, width: 640, highlight: 'var(--color-accent)', figureNumber: 1 });
    const b = renderSchematic({ snapshot: SAMPLE_SNAPSHOT, width: 640, highlight: 'var(--color-accent)', figureNumber: 1 });
    expect(a).toBe(b);
  });

  it('produces a lightweight SVG (< 6 KB) using currentColor', () => {
    const svg = renderSchematic({ snapshot: SAMPLE_SNAPSHOT, width: 640, highlight: 'var(--color-accent)' });
    expect(Buffer.byteLength(svg, 'utf-8')).toBeLessThan(6144);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-dasharray="3 3"');
  });
});
