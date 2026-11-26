import type { LayerNode, LayerRect } from './schema';

export interface StackTreeNode {
  node: LayerNode;
  depth: number;
  orderIndex: number;
  children: StackTreeNode[];
}

function numericZ(zIndex: LayerNode['zIndex']): number {
  return zIndex === 'auto' ? 0 : zIndex;
}

/**
 * Builds the stacking context tree and sorts siblings by declared paint order:
 * non-topLayer before topLayer, then numeric z-index (auto as 0), then input order.
 */
export function buildStackTree(nodes: LayerNode[]): StackTreeNode[] {
  const indexById = new Map<string, number>();
  nodes.forEach((n, idx) => indexById.set(n.id, idx));

  const childrenByParent = new Map<string | null, LayerNode[]>();
  for (const n of nodes) {
    const parentKey = n.parent !== null && indexById.has(n.parent) ? n.parent : null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(n);
    childrenByParent.set(parentKey, list);
  }

  const sortSiblings = (list: LayerNode[]): LayerNode[] =>
    [...list].sort((a, b) => {
      if (a.topLayer !== b.topLayer) return a.topLayer ? 1 : -1;
      const za = numericZ(a.zIndex);
      const zb = numericZ(b.zIndex);
      if (za !== zb) return za - zb;
      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
    });

  const visited = new Set<string>();
  const build = (parentId: string | null, depth: number): StackTreeNode[] => {
    const raw = childrenByParent.get(parentId) ?? [];
    return sortSiblings(raw)
      .filter((n) => !visited.has(n.id))
      .map((n) => {
        visited.add(n.id);
        return {
          node: n,
          depth,
          orderIndex: indexById.get(n.id) ?? 0,
          children: build(n.id, depth + 1),
        };
      });
  };

  return build(null, 0);
}

/**
 * Flattens a stack tree into declared paint order (back-to-front).
 * Negative-z children paint before their parent's positive-z children,
 * while remaining isolated inside their stacking context.
 */
export function flattenDeclaredOrder(roots: StackTreeNode[]): StackTreeNode[] {
  const result: StackTreeNode[] = [];
  const visit = (item: StackTreeNode) => {
    const neg = item.children.filter(
      (c) => !c.node.topLayer && numericZ(c.node.zIndex) < 0,
    );
    const nonNeg = item.children.filter(
      (c) => c.node.topLayer || numericZ(c.node.zIndex) >= 0,
    );
    for (const c of neg) visit(c);
    result.push(item);
    for (const c of nonNeg) visit(c);
  };
  for (const r of roots) visit(r);
  return result;
}

/**
 * Returns whether the declared paint order agrees with the real elementFromPoint hit.
 * If hitId is absent or null, there is no disagreement to report.
 */
export function declaredAgreesWithHit(
  ordered: StackTreeNode[],
  hitId: string | null | undefined,
): boolean {
  if (!hitId || ordered.length === 0) return true;
  const topmost = ordered[ordered.length - 1];
  return topmost.node.id === hitId;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalizes trace rects into a target box [0..sceneWidth] x [0..sceneHeight]
 * preserving aspect ratio.
 */
export function normalizeLayerRects(
  rects: Record<string, LayerRect>,
  sceneWidth: number,
  sceneHeight: number,
): Record<string, NormalizedRect> {
  const entries = Object.entries(rects);
  if (entries.length === 0) return {};

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [, r] of entries) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(sceneWidth / spanX, sceneHeight / spanY);

  const out: Record<string, NormalizedRect> = {};
  for (const [id, r] of entries) {
    out[id] = {
      x: Number(((r.x - minX) * scale).toFixed(1)),
      y: Number(((r.y - minY) * scale).toFixed(1)),
      width: Math.max(16, Number((r.width * scale).toFixed(1))),
      height: Math.max(12, Number((r.height * scale).toFixed(1))),
    };
  }
  return out;
}
