import { describe, expect, it } from 'vitest';
import {
  buildStackTree,
  declaredAgreesWithHit,
  flattenDeclaredOrder,
  normalizeLayerRects,
} from '@/components/instruments/layer-stack/build';
import {
  LayerStackObservedSchema,
  LayerStackTraceSchema,
} from '@/components/instruments/layer-stack/schema';
import {
  LAYER_STACK_COMPARE,
  LAYER_STACK_ORDINAL,
  LAYER_STACK_TRACE,
} from '@/components/instruments/__fixtures__/layer-stack';

describe('LayerStack build utilities', () => {
  it('validates fixtures and computes declared paint order across nested stacking contexts', () => {
    expect(LayerStackObservedSchema.safeParse(LAYER_STACK_ORDINAL).success).toBe(true);
    expect(LayerStackTraceSchema.safeParse(LAYER_STACK_TRACE).success).toBe(true);

    const roots = buildStackTree(LAYER_STACK_ORDINAL.nodes);
    expect(roots).toHaveLength(1);
    expect(roots[0].node.id).toBe('root');

    const ordered = flattenDeclaredOrder(roots);
    // card (z:1) and its trapped tooltip (z:9999) paint before header (z:10)
    expect(ordered.map((n) => n.node.id)).toEqual(['root', 'card', 'tooltip', 'header']);
    expect(declaredAgreesWithHit(ordered, 'header')).toBe(true);
  });

  it('places topLayer elements above all other stacking contexts', () => {
    const roots = buildStackTree(LAYER_STACK_COMPARE.nodes);
    const ordered = flattenDeclaredOrder(roots);
    expect(ordered[ordered.length - 1].node.id).toBe('tooltip');
    expect(declaredAgreesWithHit(ordered, 'tooltip')).toBe(true);
  });

  it('detects disagreement when probe hitId is not the topmost declared element', () => {
    const roots = buildStackTree(LAYER_STACK_ORDINAL.nodes);
    const ordered = flattenDeclaredOrder(roots);
    expect(declaredAgreesWithHit(ordered, 'tooltip')).toBe(false);
    expect(declaredAgreesWithHit(ordered, null)).toBe(true);
  });

  it('normalizes trace rectangles into target scene dimensions', () => {
    const norm = normalizeLayerRects(LAYER_STACK_TRACE.rects, 240, 120);
    expect(norm.root.x).toBe(0);
    expect(norm.root.y).toBe(0);
    expect(norm.root.width).toBe(240);
    expect(norm.root.height).toBe(120);
    expect(norm.header.width).toBe(240);
    expect(norm.tooltip.width).toBeGreaterThan(0);
    expect(norm.tooltip.width).toBeLessThan(norm.root.width);
  });
});
