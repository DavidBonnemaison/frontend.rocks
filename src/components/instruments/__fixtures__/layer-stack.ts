import type { LayerStackObserved, LayerStackTrace } from '../layer-stack/schema';

export const LAYER_STACK_ORDINAL: LayerStackObserved = {
  nodes: [
    {
      id: 'root',
      label: 'document',
      zIndex: 'auto',
      createsStackingContext: true,
      parent: null,
      topLayer: false,
    },
    {
      id: 'card',
      label: 'section.card (transform)',
      zIndex: 1,
      createsStackingContext: true,
      parent: 'root',
      topLayer: false,
    },
    {
      id: 'tooltip',
      label: 'div.tooltip',
      zIndex: 9999,
      createsStackingContext: false,
      parent: 'card',
      topLayer: false,
    },
    {
      id: 'header',
      label: 'header',
      zIndex: 10,
      createsStackingContext: true,
      parent: 'root',
      topLayer: false,
    },
  ],
  probe: { hitId: 'header' },
};

export const LAYER_STACK_TRACE: LayerStackTrace = {
  rects: {
    root: { x: 0, y: 0, width: 480, height: 240 },
    card: { x: 20, y: 40, width: 220, height: 120 },
    tooltip: { x: 60, y: 10, width: 140, height: 48 },
    header: { x: 0, y: 0, width: 480, height: 56 },
  },
  probePoint: { x: 100, y: 24 },
};

export const LAYER_STACK_COMPARE: LayerStackObserved = {
  nodes: [
    {
      id: 'root',
      label: 'document',
      zIndex: 'auto',
      createsStackingContext: true,
      parent: null,
      topLayer: false,
    },
    {
      id: 'header',
      label: 'header',
      zIndex: 10,
      createsStackingContext: true,
      parent: 'root',
      topLayer: false,
    },
    {
      id: 'tooltip',
      label: 'div.tooltip (popover)',
      zIndex: 'auto',
      createsStackingContext: true,
      parent: 'root',
      topLayer: true,
    },
  ],
  probe: { hitId: 'tooltip' },
};
