import { describe, expect, it } from 'vitest';
import { INSTRUMENT_NAMES, INSTRUMENT_REGISTRY } from '@/components/instruments/registry';
import { BOX_TREE_ORDINAL, BOX_TREE_TRACE } from '@/components/instruments/__fixtures__/box-tree';
import {
  DIFF_VIEW_OBJECT_PRIMARY,
  DIFF_VIEW_READOUT_PRIMARY,
} from '@/components/instruments/__fixtures__/diff-view';
import { EVENT_PATH_ORDINAL } from '@/components/instruments/__fixtures__/event-path';
import { FRAME_BUDGET_TRACE_60HZ } from '@/components/instruments/__fixtures__/frame-budget';
import {
  LAYER_STACK_ORDINAL,
  LAYER_STACK_TRACE,
} from '@/components/instruments/__fixtures__/layer-stack';
import {
  NETWORK_WATERFALL_ORDINAL,
  NETWORK_WATERFALL_TRACE,
} from '@/components/instruments/__fixtures__/network-waterfall';
import {
  QUEUE_VIEW_ORDINAL,
  QUEUE_VIEW_TRACE,
} from '@/components/instruments/__fixtures__/queue-view';
import { TIMELINE_ORDINAL, TIMELINE_TRACE } from '@/components/instruments/__fixtures__/timeline';

describe('Instrument registry', () => {
  it('registers an entry with observedSchema and dynamic loader for every instrument name', () => {
    expect(Object.keys(INSTRUMENT_REGISTRY).sort()).toEqual([...INSTRUMENT_NAMES].sort());
    for (const name of INSTRUMENT_NAMES) {
      const entry = INSTRUMENT_REGISTRY[name];
      expect(entry.observedSchema).toBeDefined();
      expect(typeof entry.load).toBe('function');
    }
  });

  it('validates every canonical fixture against its registered observedSchema and traceSchema', () => {
    expect(INSTRUMENT_REGISTRY['queue-view'].observedSchema.safeParse(QUEUE_VIEW_ORDINAL).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['queue-view'].traceSchema?.safeParse(QUEUE_VIEW_TRACE).success).toBe(true);

    expect(INSTRUMENT_REGISTRY.timeline.observedSchema.safeParse(TIMELINE_ORDINAL).success).toBe(true);
    expect(INSTRUMENT_REGISTRY.timeline.traceSchema?.safeParse(TIMELINE_TRACE).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['layer-stack'].observedSchema.safeParse(LAYER_STACK_ORDINAL).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['layer-stack'].traceSchema?.safeParse(LAYER_STACK_TRACE).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['box-tree'].observedSchema.safeParse(BOX_TREE_ORDINAL).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['box-tree'].traceSchema?.safeParse(BOX_TREE_TRACE).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['frame-budget'].observedSchema.safeParse(undefined).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['frame-budget'].traceSchema?.safeParse(FRAME_BUDGET_TRACE_60HZ).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['event-path'].observedSchema.safeParse(EVENT_PATH_ORDINAL).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['network-waterfall'].observedSchema.safeParse(NETWORK_WATERFALL_ORDINAL).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['network-waterfall'].traceSchema?.safeParse(NETWORK_WATERFALL_TRACE).success).toBe(true);

    expect(INSTRUMENT_REGISTRY['diff-view'].observedSchema.safeParse(DIFF_VIEW_READOUT_PRIMARY).success).toBe(true);
    expect(INSTRUMENT_REGISTRY['diff-view'].observedSchema.safeParse(DIFF_VIEW_OBJECT_PRIMARY).success).toBe(true);
  });
});
