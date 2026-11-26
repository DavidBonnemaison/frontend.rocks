import type { BoxTreeObserved, BoxTreeTrace } from '../box-tree/schema';

export const BOX_TREE_ORDINAL: BoxTreeObserved = {
  root: {
    id: 'slot',
    label: 'div.slot',
    display: 'block',
    flags: ['contains-float', 'collapsed-to-zero'],
    children: [
      {
        id: 'card',
        label: 'article.card',
        display: 'grid',
        flags: [],
        children: [
          { id: 'media', label: 'div.media', display: 'block', flags: [], children: [] },
          { id: 'body', label: 'p.body', display: 'block', flags: ['overflows'], children: [] },
        ],
      },
    ],
  },
};

export const BOX_TREE_TRACE: BoxTreeTrace = {
  sizes: {
    slot: { width: 480, height: 0 },
    card: { width: 480, height: 124.5 },
    media: { width: 160, height: 124.5 },
    body: { width: 304, height: 88.2 },
  },
};

export const BOX_TREE_COMPARE: BoxTreeObserved = {
  root: {
    id: 'slot',
    label: 'div.slot',
    display: 'flow-root',
    flags: ['contains-float'],
    children: [
      {
        id: 'card',
        label: 'article.card',
        display: 'grid',
        flags: [],
        children: [
          { id: 'media', label: 'div.media', display: 'block', flags: [], children: [] },
          { id: 'body', label: 'p.body', display: 'block', flags: [], children: [] },
        ],
      },
    ],
  },
};

export const BOX_TREE_COMPARE_TRACE: BoxTreeTrace = {
  sizes: {
    slot: { width: 480, height: 124.5 },
    card: { width: 480, height: 124.5 },
    media: { width: 160, height: 124.5 },
    body: { width: 304, height: 88.2 },
  },
};
