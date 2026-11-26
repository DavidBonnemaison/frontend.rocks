import type { BoxNode, BoxSize } from './schema';

export interface FlatTreeItem {
  id: string;
  parentId: string | null;
  depth: number;
  hasChildren: boolean;
  node: BoxNode;
}

export function collectExpandableIds(root: BoxNode): string[] {
  const ids: string[] = [];
  const walk = (n: BoxNode) => {
    if (n.children.length > 0) {
      ids.push(n.id);
      for (const child of n.children) walk(child);
    }
  };
  walk(root);
  return ids;
}

export function flattenVisibleTree(
  root: BoxNode,
  expanded: ReadonlySet<string>,
): FlatTreeItem[] {
  const out: FlatTreeItem[] = [];
  const walk = (node: BoxNode, parentId: string | null, depth: number) => {
    const hasChildren = node.children.length > 0;
    out.push({ id: node.id, parentId, depth, hasChildren, node });
    if (hasChildren && expanded.has(node.id)) {
      for (const child of node.children) {
        walk(child, node.id, depth + 1);
      }
    }
  };
  walk(root, null, 0);
  return out;
}

export interface BoxNodeDiff {
  id: string;
  presentInSecondary: boolean;
  displayChanged: boolean;
  secondaryDisplay?: string;
  flagChanges: Array<{ flag: string; kind: 'added' | 'removed' }>;
  sizeChanged: boolean;
  secondarySize?: BoxSize;
  summary: string[];
}

function indexById(root: BoxNode): Map<string, BoxNode> {
  const map = new Map<string, BoxNode>();
  const walk = (n: BoxNode) => {
    map.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return map;
}

/**
 * Compares two BoxNode trees by node id.
 * Primary is the treatment; secondary is the control.
 * Reports flag transitions as "<flag>: no -> yes" (added in treatment vs control)
 * or "<flag>: yes -> no" (removed in treatment vs control).
 */
export function diffBoxTrees(
  primary: BoxNode,
  secondary?: BoxNode,
  primarySizes?: Record<string, BoxSize>,
  secondarySizes?: Record<string, BoxSize>,
): Map<string, BoxNodeDiff> {
  const result = new Map<string, BoxNodeDiff>();
  if (!secondary) return result;

  const secondaryMap = indexById(secondary);

  const walk = (node: BoxNode) => {
    const other = secondaryMap.get(node.id);
    const summary: string[] = [];
    const flagChanges: Array<{ flag: string; kind: 'added' | 'removed' }> = [];

    if (!other) {
      summary.push('present only in primary');
      result.set(node.id, {
        id: node.id,
        presentInSecondary: false,
        displayChanged: false,
        flagChanges,
        sizeChanged: false,
        summary,
      });
    } else {
      const displayChanged = node.display !== other.display;
      if (displayChanged) {
        summary.push(`display: ${other.display} → ${node.display}`);
      }

      const primaryFlags = new Set(node.flags);
      const secondaryFlags = new Set(other.flags);

      for (const f of node.flags) {
        if (!secondaryFlags.has(f)) {
          flagChanges.push({ flag: f, kind: 'added' });
          summary.push(`${f}: no → yes`);
        }
      }
      for (const f of other.flags) {
        if (!primaryFlags.has(f)) {
          flagChanges.push({ flag: f, kind: 'removed' });
          summary.push(`${f}: yes → no`);
        }
      }

      const pSize = primarySizes?.[node.id];
      const sSize = secondarySizes?.[node.id];
      const sizeChanged = Boolean(
        pSize &&
          sSize &&
          (Math.abs(pSize.width - sSize.width) > 0.05 ||
            Math.abs(pSize.height - sSize.height) > 0.05),
      );
      if (sizeChanged && pSize && sSize) {
        summary.push(
          `size: ${sSize.width.toFixed(1)}×${sSize.height.toFixed(1)} → ${pSize.width.toFixed(1)}×${pSize.height.toFixed(1)}`,
        );
      }

      result.set(node.id, {
        id: node.id,
        presentInSecondary: true,
        displayChanged,
        secondaryDisplay: other.display,
        flagChanges,
        sizeChanged,
        secondarySize: sSize,
        summary,
      });
    }

    for (const child of node.children) walk(child);
  };

  walk(primary);
  return result;
}
