'use client';

import React, { Suspense } from 'react';
import type { Json } from '@/lib/proof/define-experiment';
import { selectPath } from '@/lib/proof/select-path';
import type { ExperimentView } from '@/lib/proof/view-schema';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from './InstrumentFrame';
import { INSTRUMENT_REGISTRY } from './registry';
import type { InstrumentName, InstrumentProps, MeasuredSummary } from './types';

export interface RenderInstrumentProps {
  view: ExperimentView;
  observed?: Json;
  compareObserved?: Json;
  presented?: Json | null;
  comparePresented?: Json | null;
  trace?: Json[] | null;
  compareTrace?: Json[] | null;
  measured?: MeasuredSummary;
  labels: { primary: string; secondary?: string };
  caption: string;
  figureNumber?: number;
  highlight?: string[];
  highlightColor?: string;
}

// Static React.lazy wrappers (load() is only invoked when that instrument renders).
const LAZY_INSTRUMENTS: Record<
  InstrumentName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React.LazyExoticComponent<React.ComponentType<InstrumentProps<any, any>>>
> = {
  'queue-view': React.lazy(INSTRUMENT_REGISTRY['queue-view'].load),
  timeline: React.lazy(INSTRUMENT_REGISTRY.timeline.load),
  'layer-stack': React.lazy(INSTRUMENT_REGISTRY['layer-stack'].load),
  'box-tree': React.lazy(INSTRUMENT_REGISTRY['box-tree'].load),
  'frame-budget': React.lazy(INSTRUMENT_REGISTRY['frame-budget'].load),
  'event-path': React.lazy(INSTRUMENT_REGISTRY['event-path'].load),
  'network-waterfall': React.lazy(INSTRUMENT_REGISTRY['network-waterfall'].load),
  'diff-view': React.lazy(INSTRUMENT_REGISTRY['diff-view'].load),
};

function formatFirstZodPath(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  const first = issues[0];
  if (!first) return 'Invalid observation payload';
  const loc = first.path.length > 0 ? first.path.map(String).join('.') : '(root)';
  return `${loc}: ${first.message}`;
}

function resolveEnrichment(
  view: ExperimentView,
  presented: Json | null | undefined,
  trace: Json[] | null | undefined,
): Json | undefined {
  if (view.presentedPath !== null && presented !== undefined && presented !== null) {
    const res = selectPath(presented, view.presentedPath);
    return res.ok ? res.value : undefined;
  }
  if (view.tracePath !== null && trace !== undefined && trace !== null) {
    const res = selectPath(trace, view.tracePath);
    return res.ok ? res.value : undefined;
  }
  return undefined;
}

export function RenderInstrument({
  view,
  observed,
  compareObserved,
  presented,
  comparePresented,
  trace,
  compareTrace,
  measured,
  labels,
  caption,
  figureNumber,
  highlight,
  highlightColor,
}: RenderInstrumentProps) {
  const entry = INSTRUMENT_REGISTRY[view.instrument];
  const allowCompare = view.compare !== 'none';

  // 1. Resolve and validate observed (frame-budget may omit observed and use measured)
  let validatedObserved: unknown = undefined;
  if (view.instrument !== 'frame-budget') {
    if (observed === undefined) {
      return (
        <InstrumentFrame
          caption={caption}
          figureNumber={figureNumber}
          highlightColor={highlightColor}
          empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
        />
      );
    }
    const selected = selectPath(observed, view.observedPath);
    if (!selected.ok) {
      return (
        <InstrumentFrame
          caption={caption}
          figureNumber={figureNumber}
          highlightColor={highlightColor}
          empty={UI_STRINGS.INSTRUMENTS.noDataAtPath(selected.at)}
        />
      );
    }
    const parsed = entry.observedSchema.safeParse(selected.value);
    if (!parsed.success) {
      return (
        <InstrumentFrame
          caption={caption}
          figureNumber={figureNumber}
          highlightColor={highlightColor}
          error={formatFirstZodPath(parsed.error.issues)}
        />
      );
    }
    validatedObserved = parsed.data;
  }

  // 2. Optional compareObserved
  let validatedCompareObserved: unknown = undefined;
  if (allowCompare && view.instrument !== 'frame-budget' && compareObserved !== undefined) {
    const selectedCmp = selectPath(compareObserved, view.observedPath);
    if (selectedCmp.ok) {
      const parsedCmp = entry.observedSchema.safeParse(selectedCmp.value);
      if (parsedCmp.success) {
        validatedCompareObserved = parsedCmp.data;
      }
    }
  }

  // 3. Optional enrichment (presented wins over trace), validated against traceSchema
  let validatedTrace: unknown = undefined;
  let validatedCompareTrace: unknown = undefined;
  if (entry.traceSchema) {
    const rawEnrichment = resolveEnrichment(view, presented, trace);
    if (rawEnrichment !== undefined) {
      const parsedTrace = entry.traceSchema.safeParse(rawEnrichment);
      if (parsedTrace.success) {
        validatedTrace = parsedTrace.data;
      } else if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[instruments/${view.instrument}] Ignoring invalid enrichment: ${formatFirstZodPath(parsedTrace.error.issues)}`,
        );
      }
    }

    if (allowCompare) {
      const rawCmpEnrichment = resolveEnrichment(view, comparePresented, compareTrace);
      if (rawCmpEnrichment !== undefined) {
        const parsedCmpTrace = entry.traceSchema.safeParse(rawCmpEnrichment);
        if (parsedCmpTrace.success) {
          validatedCompareTrace = parsedCmpTrace.data;
        }
      }
    }
  }

  const InstrumentComponent = LAZY_INSTRUMENTS[view.instrument];

  return (
    <Suspense
      fallback={
        <InstrumentFrame
          caption={caption}
          figureNumber={figureNumber}
          highlightColor={highlightColor}
          empty="Loading instrument…"
        />
      }
    >
      {React.createElement(InstrumentComponent, {
        observed: validatedObserved,
        compareObserved: validatedCompareObserved,
        trace: validatedTrace,
        compareTrace: validatedCompareTrace,
        measured,
        labels,
        caption,
        figureNumber,
        highlight,
        highlightColor,
      })}
    </Suspense>
  );
}
