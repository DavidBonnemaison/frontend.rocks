import { describe, expect, it } from 'vitest';
import {
  collectExpandableIds,
  diffBoxTrees,
  flattenVisibleTree,
} from '@/components/instruments/box-tree/diff';
import {
  BoxTreeObservedSchema,
  BoxTreeTraceSchema,
  type BoxNode,
} from '@/components/instruments/box-tree/schema';
import {
  BOX_TREE_COMPARE,
  BOX_TREE_COMPARE_TRACE,
  BOX_TREE_ORDINAL,
  BOX_TREE_TRACE,
} from '@/components/instruments/__fixtures__/box-tree';

describe('BoxTree utilities', () => {
  it('validates fixtures and flattens visible tree according to expanded set', () => {
    expect(BoxTreeObservedSchema.safeParse(BOX_TREE_ORDINAL).success).toBe(true);
    expect(BoxTreeTraceSchema.safeParse(BOX_TREE_TRACE).success).toBe(true);

    const allExpanded = new Set(collectExpandableIds(BOX_TREE_ORDINAL.root));
    expect(flattenVisibleTree(BOX_TREE_ORDINAL.root, allExpanded).map((i) => i.id)).toEqual([
      'slot',
      'card',
      'media',
      'body',
    ]);

    const onlyRoot = new Set(['slot']);
    expect(flattenVisibleTree(BOX_TREE_ORDINAL.root, onlyRoot).map((i) => i.id)).toEqual([
      'slot',
      'card',
    ]);

    const collapsed = new Set<string>();
    expect(flattenVisibleTree(BOX_TREE_ORDINAL.root, collapsed).map((i) => i.id)).toEqual(['slot']);
  });

  it('diffs flags, display, and measured sizes between primary and secondary trees', () => {
    const diffs = diffBoxTrees(
      BOX_TREE_ORDINAL.root,
      BOX_TREE_COMPARE.root,
      BOX_TREE_TRACE.sizes,
      BOX_TREE_COMPARE_TRACE.sizes,
    );

    const slotDiff = diffs.get('slot');
    expect(slotDiff).toBeDefined();
    expect(slotDiff?.displayChanged).toBe(true);
    expect(slotDiff?.sizeChanged).toBe(true);
    expect(slotDiff?.summary).toContain('collapsed-to-zero: no → yes');

    const bodyDiff = diffs.get('body');
    expect(bodyDiff?.summary).toContain('overflows: no → yes');

    const mediaDiff = diffs.get('media');
    expect(mediaDiff?.summary).toEqual([]);
  });

  it('compares trees of different shapes by id without throwing', () => {
    const a: BoxNode = {
      id: 'root',
      label: 'root',
      display: 'block',
      flags: [],
      children: [{ id: 'extra', label: 'extra', display: 'inline', flags: ['a'], children: [] }],
    };
    const b: BoxNode = {
      id: 'root',
      label: 'root',
      display: 'block',
      flags: ['removed-flag'],
      children: [],
    };
    const diffs = diffBoxTrees(a, b);
    expect(diffs.get('root')?.summary).toContain('removed-flag: yes → no');
    expect(diffs.get('extra')?.presentInSecondary).toBe(false);
  });
});
