'use client';

import React, { useState } from 'react';
import {
  INSTRUMENT_NAMES,
  ReducedMotionOverrideContext,
  RenderInstrument,
  type InstrumentName,
} from '@/components/instruments';
import {
  BOX_TREE_COMPARE,
  BOX_TREE_COMPARE_TRACE,
  BOX_TREE_ORDINAL,
  BOX_TREE_TRACE,
} from '@/components/instruments/__fixtures__/box-tree';
import {
  DIFF_VIEW_OBJECT_PRIMARY,
  DIFF_VIEW_OBJECT_SECONDARY,
  DIFF_VIEW_READOUT_PRIMARY,
  DIFF_VIEW_READOUT_SECONDARY,
} from '@/components/instruments/__fixtures__/diff-view';
import {
  EVENT_PATH_COMPARE,
  EVENT_PATH_ORDINAL,
} from '@/components/instruments/__fixtures__/event-path';
import {
  FRAME_BUDGET_MEASURED,
  FRAME_BUDGET_TRACE_60HZ,
  FRAME_BUDGET_TRACE_SHORT,
} from '@/components/instruments/__fixtures__/frame-budget';
import {
  LAYER_STACK_COMPARE,
  LAYER_STACK_ORDINAL,
  LAYER_STACK_TRACE,
} from '@/components/instruments/__fixtures__/layer-stack';
import {
  NETWORK_WATERFALL_COMPARE,
  NETWORK_WATERFALL_ORDINAL,
  NETWORK_WATERFALL_TRACE,
} from '@/components/instruments/__fixtures__/network-waterfall';
import {
  QUEUE_VIEW_COMPARE,
  QUEUE_VIEW_ORDINAL,
  QUEUE_VIEW_TRACE,
} from '@/components/instruments/__fixtures__/queue-view';
import {
  TIMELINE_COMPARE,
  TIMELINE_COMPARE_TRACE,
  TIMELINE_ORDINAL,
  TIMELINE_TRACE,
} from '@/components/instruments/__fixtures__/timeline';
import type { Json } from '@/lib/proof/define-experiment';
import { ExperimentViewSchema } from '@/lib/proof/view-schema';

function makeView(
  instrument: InstrumentName,
  opts?: {
    observedPath?: string;
    tracePath?: string | null;
    presentedPath?: string | null;
    compare?: 'none' | 'side-by-side' | 'overlay';
  },
) {
  return ExperimentViewSchema.parse({
    instrument,
    observedPath: opts?.observedPath ?? '',
    tracePath: opts?.tracePath ?? null,
    presentedPath: opts?.presentedPath ?? null,
    compare: opts?.compare ?? 'side-by-side',
  });
}

export function InstrumentsGallery() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
    }
  };

  return (
    <ReducedMotionOverrideContext.Provider value={reducedMotion ? true : null}>
      <div className="dev-inst-page container" data-theme={theme}>
        <header className="dev-inst-header">
          <p className="caps" style={{ margin: 0, color: 'var(--color-ink-muted)' }}>
            INTERNAL GALLERY · NOINDEX · FIXTURE DATA
          </p>
          <h1 style={{ margin: 0 }}>Visualization Instruments</h1>
          <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>
            All 8 instruments rendered from deterministic fixtures in ordinal, traced, compared,
            empty, and schema-error states.
          </p>

          <div className="dev-inst-toolbar" role="region" aria-label="Gallery display controls">
            <div className="dev-inst-theme-group" role="group" aria-label="Theme selector">
              <span className="caps" style={{ color: 'var(--color-ink-muted)' }}>
                Theme:
              </span>
              <button
                type="button"
                className="dev-inst-theme-btn"
                aria-pressed={theme === 'light'}
                onClick={() => applyTheme('light')}
                data-testid="gallery-theme-light"
              >
                Light
              </button>
              <button
                type="button"
                className="dev-inst-theme-btn"
                aria-pressed={theme === 'dark'}
                onClick={() => applyTheme('dark')}
                data-testid="gallery-theme-dark"
              >
                Dark
              </button>
            </div>

            <label className="dev-inst-checkbox">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                data-testid="gallery-reduced-motion"
              />
              <span>Reduced motion</span>
            </label>
          </div>

          <nav aria-label="Instrument sections">
            <ul className="dev-inst-toc">
              {INSTRUMENT_NAMES.map((name) => (
                <li key={name}>
                  <a href={`#inst-${name}`}>{name}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        {/* 1. QueueView */}
        <section id="inst-queue-view" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>queue-view</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-queue-view-ordinal" data-testid="inst-queue-view-ordinal">
              <p className="dev-inst-case-label">Ordinal (observed only)</p>
              <RenderInstrument
                view={makeView('queue-view', { compare: 'none' })}
                observed={QUEUE_VIEW_ORDINAL as unknown as Json}
                labels={{ primary: 'Event loop' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={1}
              />
            </div>

            <div className="dev-inst-case" id="inst-queue-view-trace" data-testid="inst-queue-view-trace">
              <p className="dev-inst-case-label">With trace timestamps (presented)</p>
              <RenderInstrument
                view={makeView('queue-view', { presentedPath: '', compare: 'none' })}
                observed={QUEUE_VIEW_ORDINAL as unknown as Json}
                presented={QUEUE_VIEW_TRACE as unknown as Json}
                labels={{ primary: 'Event loop' }}
                caption="Recorded in your browser · Chromium 143"
                figureNumber={2}
              />
            </div>

            <div className="dev-inst-case" id="inst-queue-view-compare" data-testid="inst-queue-view-compare">
              <p className="dev-inst-case-label">Compare (treatment vs control)</p>
              <RenderInstrument
                view={makeView('queue-view')}
                observed={QUEUE_VIEW_ORDINAL as unknown as Json}
                compareObserved={QUEUE_VIEW_COMPARE as unknown as Json}
                labels={{ primary: 'With microtasks', secondary: 'Tasks only' }}
                caption="Recorded by the nightly run · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-queue-view-empty" data-testid="inst-queue-view-empty">
              <p className="dev-inst-case-label">Empty / missing path</p>
              <RenderInstrument
                view={makeView('queue-view', { observedPath: 'missing.events' })}
                observed={QUEUE_VIEW_ORDINAL as unknown as Json}
                labels={{ primary: 'Event loop' }}
                caption="Empty state fixture"
              />
            </div>

            <div className="dev-inst-case" id="inst-queue-view-error" data-testid="inst-queue-view-error">
              <p className="dev-inst-case-label">Schema error</p>
              <RenderInstrument
                view={makeView('queue-view')}
                observed={{ events: [{ seq: -1, op: 'bogus', queue: 'task', label: 'bad' }] }}
                labels={{ primary: 'Event loop' }}
                caption="Schema error fixture"
              />
            </div>
          </div>
        </section>

        {/* 2. Timeline */}
        <section id="inst-timeline" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>timeline</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-timeline-ordinal" data-testid="inst-timeline-ordinal">
              <p className="dev-inst-case-label">Ordinal (observed only)</p>
              <RenderInstrument
                view={makeView('timeline', { compare: 'none' })}
                observed={TIMELINE_ORDINAL as unknown as Json}
                labels={{ primary: 'As written' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={3}
              />
            </div>

            <div className="dev-inst-case" id="inst-timeline-trace" data-testid="inst-timeline-trace">
              <p className="dev-inst-case-label">Temporal with trace &amp; compare</p>
              <RenderInstrument
                view={makeView('timeline', { presentedPath: '' })}
                observed={TIMELINE_ORDINAL as unknown as Json}
                compareObserved={TIMELINE_COMPARE as unknown as Json}
                presented={TIMELINE_TRACE as unknown as Json}
                comparePresented={TIMELINE_COMPARE_TRACE as unknown as Json}
                labels={{ primary: 'Double click bug', secondary: 'Disabled on click' }}
                caption="Recorded in your browser · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-timeline-error" data-testid="inst-timeline-error">
              <p className="dev-inst-case-label">Schema error</p>
              <RenderInstrument
                view={makeView('timeline')}
                observed={{ events: [] }}
                labels={{ primary: 'Timeline' }}
                caption="Schema error fixture"
              />
            </div>
          </div>
        </section>

        {/* 3. LayerStack */}
        <section id="inst-layer-stack" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>layer-stack</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-layer-stack-ordinal" data-testid="inst-layer-stack-ordinal">
              <p className="dev-inst-case-label">Ordinal (observed only)</p>
              <RenderInstrument
                view={makeView('layer-stack', { compare: 'none' })}
                observed={LAYER_STACK_ORDINAL as unknown as Json}
                labels={{ primary: 'With transform' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={4}
              />
            </div>

            <div className="dev-inst-case" id="inst-layer-stack-trace" data-testid="inst-layer-stack-trace">
              <p className="dev-inst-case-label">With trace rects &amp; compare</p>
              <RenderInstrument
                view={makeView('layer-stack', { presentedPath: '' })}
                observed={LAYER_STACK_ORDINAL as unknown as Json}
                compareObserved={LAYER_STACK_COMPARE as unknown as Json}
                presented={LAYER_STACK_TRACE as unknown as Json}
                labels={{ primary: 'Trapped z-index: 9999', secondary: 'Popover top-layer' }}
                caption="Recorded in your browser · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-layer-stack-error" data-testid="inst-layer-stack-error">
              <p className="dev-inst-case-label">Schema error</p>
              <RenderInstrument
                view={makeView('layer-stack')}
                observed={{ nodes: [] }}
                labels={{ primary: 'LayerStack' }}
                caption="Schema error fixture"
              />
            </div>
          </div>
        </section>

        {/* 4. BoxTree */}
        <section id="inst-box-tree" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>box-tree</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-box-tree-ordinal" data-testid="inst-box-tree-ordinal">
              <p className="dev-inst-case-label">Ordinal (observed only)</p>
              <RenderInstrument
                view={makeView('box-tree', { compare: 'none' })}
                observed={BOX_TREE_ORDINAL as unknown as Json}
                labels={{ primary: 'display: block' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={5}
              />
            </div>

            <div className="dev-inst-case" id="inst-box-tree-compare" data-testid="inst-box-tree-compare">
              <p className="dev-inst-case-label">With trace sizes &amp; compare</p>
              <RenderInstrument
                view={makeView('box-tree', { presentedPath: '' })}
                observed={BOX_TREE_ORDINAL as unknown as Json}
                compareObserved={BOX_TREE_COMPARE as unknown as Json}
                presented={BOX_TREE_TRACE as unknown as Json}
                comparePresented={BOX_TREE_COMPARE_TRACE as unknown as Json}
                labels={{ primary: 'display: block', secondary: 'display: flow-root' }}
                caption="Recorded in your browser · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-box-tree-error" data-testid="inst-box-tree-error">
              <p className="dev-inst-case-label">Schema error</p>
              <RenderInstrument
                view={makeView('box-tree')}
                observed={{ root: { id: 'x' } }}
                labels={{ primary: 'BoxTree' }}
                caption="Schema error fixture"
              />
            </div>
          </div>
        </section>

        {/* 5. FrameBudget */}
        <section id="inst-frame-budget" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>frame-budget</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-frame-budget-measured" data-testid="inst-frame-budget-measured">
              <p className="dev-inst-case-label">Measured only (recorded nightly)</p>
              <RenderInstrument
                view={makeView('frame-budget', { compare: 'none' })}
                measured={FRAME_BUDGET_MEASURED}
                labels={{ primary: 'As written', secondary: 'Batched reads' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={6}
              />
            </div>

            <div className="dev-inst-case" id="inst-frame-budget-trace" data-testid="inst-frame-budget-trace">
              <p className="dev-inst-case-label">Measured + 60 Hz frame trace</p>
              <RenderInstrument
                view={makeView('frame-budget', { presentedPath: '' })}
                measured={FRAME_BUDGET_MEASURED}
                presented={FRAME_BUDGET_TRACE_60HZ as unknown as Json}
                labels={{ primary: 'As written', secondary: 'Batched reads' }}
                caption="Recorded in your browser · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-frame-budget-short" data-testid="inst-frame-budget-short">
              <p className="dev-inst-case-label">Insufficient frames (&lt; 10)</p>
              <RenderInstrument
                view={makeView('frame-budget', { presentedPath: '' })}
                measured={FRAME_BUDGET_MEASURED}
                presented={FRAME_BUDGET_TRACE_SHORT as unknown as Json}
                labels={{ primary: 'As written', secondary: 'Batched reads' }}
                caption="Headless throttled rAF fixture"
              />
            </div>
          </div>
        </section>

        {/* 6. EventPath */}
        <section id="inst-event-path" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>event-path</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-event-path-ordinal" data-testid="inst-event-path-ordinal">
              <p className="dev-inst-case-label">Shadow DOM retargeting + stopPropagation</p>
              <RenderInstrument
                view={makeView('event-path')}
                observed={EVENT_PATH_ORDINAL as unknown as Json}
                compareObserved={EVENT_PATH_COMPARE as unknown as Json}
                labels={{ primary: 'stopPropagation()', secondary: 'Unstopped' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={7}
              />
            </div>

            <div className="dev-inst-case" id="inst-event-path-error" data-testid="inst-event-path-error">
              <p className="dev-inst-case-label">Schema error</p>
              <RenderInstrument
                view={makeView('event-path')}
                observed={{ type: 'click', steps: [] }}
                labels={{ primary: 'EventPath' }}
                caption="Schema error fixture"
              />
            </div>
          </div>
        </section>

        {/* 7. NetworkWaterfall */}
        <section id="inst-network-waterfall" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>network-waterfall</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-network-waterfall-ordinal" data-testid="inst-network-waterfall-ordinal">
              <p className="dev-inst-case-label">Ordinal (observed only)</p>
              <RenderInstrument
                view={makeView('network-waterfall', { compare: 'none' })}
                observed={NETWORK_WATERFALL_ORDINAL as unknown as Json}
                labels={{ primary: 'Double payment bug' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={8}
              />
            </div>

            <div className="dev-inst-case" id="inst-network-waterfall-trace" data-testid="inst-network-waterfall-trace">
              <p className="dev-inst-case-label">With trace timings &amp; compare</p>
              <RenderInstrument
                view={makeView('network-waterfall', { presentedPath: '' })}
                observed={NETWORK_WATERFALL_ORDINAL as unknown as Json}
                compareObserved={NETWORK_WATERFALL_COMPARE as unknown as Json}
                presented={NETWORK_WATERFALL_TRACE as unknown as Json}
                labels={{ primary: 'Without idempotency', secondary: 'With Idempotency-Key' }}
                caption="Recorded in your browser · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-network-waterfall-empty" data-testid="inst-network-waterfall-empty">
              <p className="dev-inst-case-label">Empty</p>
              <RenderInstrument
                view={makeView('network-waterfall')}
                observed={{ requests: [] }}
                labels={{ primary: 'Network' }}
                caption="Empty fixture"
              />
            </div>
          </div>
        </section>

        {/* 8. DiffView */}
        <section id="inst-diff-view" className="dev-inst-section">
          <div className="dev-inst-section-head">
            <h2 style={{ margin: 0 }}>diff-view</h2>
          </div>
          <div className="dev-inst-cases">
            <div className="dev-inst-case" id="inst-diff-view-readout" data-testid="inst-diff-view-readout">
              <p className="dev-inst-case-label">Numeric leaves (7-segment Readout mode)</p>
              <RenderInstrument
                view={makeView('diff-view')}
                observed={DIFF_VIEW_READOUT_PRIMARY}
                compareObserved={DIFF_VIEW_READOUT_SECONDARY}
                labels={{ primary: 'container-type: inline-size', secondary: 'Control' }}
                caption="Recorded by the nightly run · Chromium 143"
                figureNumber={9}
              />
            </div>

            <div className="dev-inst-case" id="inst-diff-view-compare" data-testid="inst-diff-view-compare">
              <p className="dev-inst-case-label">Object diff with highlight</p>
              <RenderInstrument
                view={makeView('diff-view')}
                observed={DIFF_VIEW_OBJECT_PRIMARY}
                compareObserved={DIFF_VIEW_OBJECT_SECONDARY}
                labels={{ primary: 'Treatment', secondary: 'Control' }}
                highlight={['matched', 'computed.gridTemplateColumns']}
                caption="Recorded by the nightly run · Chromium 143"
              />
            </div>

            <div className="dev-inst-case" id="inst-diff-view-single" data-testid="inst-diff-view-single">
              <p className="dev-inst-case-label">Single column (no compare)</p>
              <RenderInstrument
                view={makeView('diff-view', { compare: 'none' })}
                observed={DIFF_VIEW_OBJECT_PRIMARY}
                labels={{ primary: 'Treatment' }}
                caption="Single column fixture"
              />
            </div>
          </div>
        </section>
      </div>
    </ReducedMotionOverrideContext.Provider>
  );
}
