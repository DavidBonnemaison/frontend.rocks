'use client';

import React, { useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import { useStepper } from '../useStepper';
import { buildQueueSnapshots, formatQueueAnnouncement, indexQueueTimings } from './build';
import type { QueueObserved, QueueTrace } from './schema';

markInstrumentLoaded('queue-view');

const QUEUE_COLUMNS = [
  { key: 'task', title: 'Tasks' },
  { key: 'microtask', title: 'Microtasks' },
  { key: 'raf', title: 'rAF' },
] as const;

export default function QueueView({
  observed,
  compareObserved,
  trace,
  compareTrace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<QueueObserved, QueueTrace>) {
  const timings = useMemo(() => indexQueueTimings(trace), [trace]);
  const snapshots = useMemo(
    () => buildQueueSnapshots(observed.events, timings),
    [observed.events, timings],
  );

  const compareTimings = useMemo(() => indexQueueTimings(compareTrace), [compareTrace]);
  const compareSnapshots = useMemo(
    () => (compareObserved ? buildQueueSnapshots(compareObserved.events, compareTimings) : null),
    [compareObserved, compareTimings],
  );

  const stepper = useStepper(snapshots.length, 0);
  const current = snapshots[stepper.index];

  if (!current) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
        note={UI_STRINGS.INSTRUMENTS.queueViewLegend}
      />
    );
  }

  const announce = formatQueueAnnouncement(current, stepper.index, snapshots.length);
  const compareCurrent = compareSnapshots
    ? compareSnapshots[Math.min(stepper.index, compareSnapshots.length - 1)]
    : null;

  const controls = (
    <>
      <div className="inst-stepper" role="group" aria-label="Event loop step controls">
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.home}
          disabled={stepper.index === 0}
          aria-label="First step"
        >
          First
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.prev}
          disabled={stepper.index === 0}
          aria-label="Previous step"
        >
          Prev
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.next}
          disabled={stepper.index >= snapshots.length - 1}
          aria-label="Next step"
        >
          Next
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.end}
          disabled={stepper.index >= snapshots.length - 1}
          aria-label="Last step"
        >
          Last
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.togglePlay}
          disabled={stepper.reducedMotion || snapshots.length <= 1}
          aria-pressed={stepper.playing}
        >
          {stepper.playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <span className="inst-step-counter">
        STEP {stepper.index + 1} / {snapshots.length}
        {current.t !== null ? ` · +${current.t.toFixed(1)} MS` : ''}
      </span>
    </>
  );

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={announce}
      controls={controls}
      note={UI_STRINGS.INSTRUMENTS.queueViewLegend}
    >
      <div
        tabIndex={0}
        onKeyDown={stepper.onKeyDown}
        aria-label={`Event loop queues (${labels.primary}). Use arrow keys to step.`}
      >
        {compareCurrent ? (
          <div className="inst-legend" style={{ marginBottom: 'var(--space-s)' }}>
            <span className="inst-legend-item">
              <span className="inst-legend-swatch" aria-hidden="true" />
              {labels.primary}
            </span>
            <span className="inst-legend-item">
              <span className="inst-legend-swatch inst-legend-swatch-dashed" aria-hidden="true" />
              {labels.secondary ?? 'Control'}
            </span>
          </div>
        ) : null}

        <div className="inst-qv-running" data-active={current.running ? 'true' : 'false'}>
          <span className="inst-qv-running-title">
            RUNNING ({labels.primary})
          </span>
          <span className="inst-qv-running-val">
            {current.running ? `${current.running.label} [${current.running.queue}]` : 'idle'}
          </span>
        </div>

        <div className="inst-qv-cols">
          {QUEUE_COLUMNS.map((col) => {
            const items = current[col.key];
            return (
              <div key={col.key} className="inst-qv-col">
                <div className="inst-qv-col-head">
                  <span>{col.title}</span>
                  <span>{items.length}</span>
                </div>
                <ol className="inst-qv-list" aria-label={`${col.title} queue`}>
                  {items.length === 0 ? (
                    <li className="inst-qv-empty">empty</li>
                  ) : (
                    items.map((item, idx) => (
                      <li key={`${item}-${idx}`} className="inst-qv-item">
                        {item}
                      </li>
                    ))
                  )}
                </ol>
              </div>
            );
          })}
        </div>

        {compareCurrent ? (
          <div style={{ marginTop: 'var(--space-m)' }}>
            <div
              className="inst-qv-running"
              style={{ borderStyle: 'dashed' }}
              data-active="false"
            >
              <span className="inst-qv-running-title">
                RUNNING ({labels.secondary ?? 'Control'})
              </span>
              <span className="inst-qv-running-val">
                {compareCurrent.running
                  ? `${compareCurrent.running.label} [${compareCurrent.running.queue}]`
                  : 'idle'}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </InstrumentFrame>
  );
}
