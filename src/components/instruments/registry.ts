import type React from 'react';
import type { z } from 'zod';
import { BoxTreeObservedSchema, BoxTreeTraceSchema } from './box-tree/schema';
import { DiffObservedSchema } from './diff-view/schema';
import { EventPathObservedSchema } from './event-path/schema';
import { FrameBudgetObservedSchema, FrameBudgetTraceSchema } from './frame-budget/schema';
import { LayerStackObservedSchema, LayerStackTraceSchema } from './layer-stack/schema';
import { NetworkObservedSchema, NetworkTraceSchema } from './network-waterfall/schema';
import { QueueObservedSchema, QueueTraceSchema } from './queue-view/schema';
import { TimelineObservedSchema, TimelineTraceSchema } from './timeline/schema';
import { INSTRUMENT_NAMES, type InstrumentName, type InstrumentProps } from './types';

export { INSTRUMENT_NAMES };
export type { InstrumentName, InstrumentProps };

export interface InstrumentEntry<O = unknown, T = unknown> {
  observedSchema: z.ZodType<O>;
  traceSchema?: z.ZodType<T>;
  load: () => Promise<{ default: React.ComponentType<InstrumentProps<O, T>> }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INSTRUMENT_REGISTRY: Record<InstrumentName, InstrumentEntry<any, any>> = {
  'queue-view': {
    observedSchema: QueueObservedSchema,
    traceSchema: QueueTraceSchema,
    load: () => import('./queue-view/QueueView'),
  },
  timeline: {
    observedSchema: TimelineObservedSchema,
    traceSchema: TimelineTraceSchema,
    load: () => import('./timeline/Timeline'),
  },
  'layer-stack': {
    observedSchema: LayerStackObservedSchema,
    traceSchema: LayerStackTraceSchema,
    load: () => import('./layer-stack/LayerStack'),
  },
  'box-tree': {
    observedSchema: BoxTreeObservedSchema,
    traceSchema: BoxTreeTraceSchema,
    load: () => import('./box-tree/BoxTree'),
  },
  'frame-budget': {
    observedSchema: FrameBudgetObservedSchema,
    traceSchema: FrameBudgetTraceSchema,
    load: () => import('./frame-budget/FrameBudget'),
  },
  'event-path': {
    observedSchema: EventPathObservedSchema,
    load: () => import('./event-path/EventPath'),
  },
  'network-waterfall': {
    observedSchema: NetworkObservedSchema,
    traceSchema: NetworkTraceSchema,
    load: () => import('./network-waterfall/NetworkWaterfall'),
  },
  'diff-view': {
    observedSchema: DiffObservedSchema,
    load: () => import('./diff-view/DiffView'),
  },
};
