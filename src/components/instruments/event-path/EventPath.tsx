'use client';

import React, { useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import { useStepper } from '../useStepper';
import { annotateEventPath, type EventPathObserved } from './schema';

markInstrumentLoaded('event-path');

const PHASE_SYMBOL: Record<'capture' | 'target' | 'bubble', string> = {
  capture: '↓ CAPTURE',
  target: '● TARGET',
  bubble: '↑ BUBBLE',
};

export default function EventPath({
  observed,
  compareObserved,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<EventPathObserved>) {
  const annotated = useMemo(() => annotateEventPath(observed.steps), [observed.steps]);
  const compareAnnotated = useMemo(
    () => (compareObserved ? annotateEventPath(compareObserved.steps) : null),
    [compareObserved],
  );

  const stepper = useStepper(annotated.length, 0);
  const current = annotated[stepper.index];

  if (annotated.length === 0) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
      />
    );
  }

  const announce = current
    ? `Step ${stepper.index + 1} of ${annotated.length}: ${current.step.phase} phase at ${current.step.node}, ${current.step.listenersCalled} listener${current.step.listenersCalled === 1 ? '' : 's'} called${current.step.stopped ? ', propagation stopped' : ''}${current.unreached ? ', not reached' : ''}${current.retargeted && current.step.targetSeenAs ? `, target seen as ${current.step.targetSeenAs}` : ''}.`
    : '';

  const controls = (
    <>
      <div className="inst-stepper" role="group" aria-label="Event path step controls">
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.prev}
          disabled={stepper.index === 0}
          aria-label="Previous step"
        >
          Previous
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.next}
          disabled={stepper.index >= annotated.length - 1}
          aria-label="Next step"
        >
          Next
        </button>
      </div>
      <span className="inst-step-counter">
        EVENT &quot;{observed.type}&quot; · STEP {stepper.index + 1} / {annotated.length}
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
    >
      <div
        tabIndex={0}
        onKeyDown={stepper.onKeyDown}
        aria-label={`Event propagation path for ${observed.type} (${labels.primary}). Use arrow keys to step.`}
      >
        {compareAnnotated ? (
          <div className="inst-legend" style={{ marginBottom: 'var(--space-s)' }}>
            <span className="inst-legend-item">
              <span className="inst-legend-swatch" aria-hidden="true" />
              {labels.primary} ({annotated.filter((a) => !a.unreached).length} reached)
            </span>
            <span className="inst-legend-item">
              <span className="inst-legend-swatch inst-legend-swatch-dashed" aria-hidden="true" />
              {labels.secondary ?? 'Control'} (
              {compareAnnotated.filter((a) => !a.unreached).length} reached)
            </span>
          </div>
        ) : null}

        <ol className="inst-ep-list">
          {annotated.map((item) => {
            const isActive = item.index === stepper.index;
            return (
              <React.Fragment key={`${item.step.phase}-${item.step.node}-${item.index}`}>
                {item.shadowBoundary ? (
                  <li className="inst-ep-shadow-sep" aria-hidden="true">
                    --- SHADOW ROOT BOUNDARY ---
                  </li>
                ) : null}
                <li
                  className="inst-ep-step"
                  data-active={isActive ? 'true' : 'false'}
                  data-unreached={item.unreached ? 'true' : 'false'}
                >
                  <span className="inst-ep-phase">{PHASE_SYMBOL[item.step.phase]}</span>
                  <span className="inst-ep-node">{item.step.node}</span>
                  <span>
                    {item.step.listenersCalled} listener
                    {item.step.listenersCalled === 1 ? '' : 's'}
                  </span>
                  {item.step.stopped ? (
                    <span className="inst-ep-tag inst-ep-tag-stop">STOPPED</span>
                  ) : null}
                  {item.unreached ? <span className="inst-ep-tag">NOT REACHED</span> : null}
                  {item.retargeted && item.step.targetSeenAs ? (
                    <span className="inst-ep-tag inst-ep-tag-retarget">
                      TARGET SEEN AS: {item.step.targetSeenAs}
                    </span>
                  ) : null}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </div>
    </InstrumentFrame>
  );
}
