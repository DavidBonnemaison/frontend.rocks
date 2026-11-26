import React from 'react';
import { StatusLed, type InstrumentStatus } from './StatusLed';
import './Instrument.css';

export interface InstrumentPanelProps {
  experimentId: string;
  status: InstrumentStatus;
  question: string;
  figureNumber?: number;
  caption?: string;
  stage: React.ReactNode;
  controls?: React.ReactNode;
  readouts?: React.ReactNode;
  footer?: React.ReactNode;
}

export function InstrumentPanel({
  experimentId,
  status,
  question,
  figureNumber,
  caption,
  stage,
  controls,
  readouts,
  footer,
}: InstrumentPanelProps) {
  return (
    <section className="instrument-panel" aria-label={`Experiment ${experimentId}`}>
      <header className="instrument-panel-bar">
        <div className="instrument-panel-id">
          <span className="caps">EXPERIMENT</span>
          <span className="meta">{experimentId}</span>
        </div>
        <StatusLed status={status} />
      </header>

      <p className="instrument-panel-question">{question}</p>

      <div>
        <div className="instrument-panel-stage">{stage}</div>
        {caption || typeof figureNumber === 'number' ? (
          <p className="instrument-panel-caption caps">
            {typeof figureNumber === 'number' ? `FIG. ${figureNumber}` : null}
            {typeof figureNumber === 'number' && caption ? ' · ' : null}
            {caption}
          </p>
        ) : null}
      </div>

      {controls || readouts ? (
        <div className="instrument-panel-grid">
          {controls}
          {readouts}
        </div>
      ) : null}

      {footer ? <footer className="instrument-panel-footer">{footer}</footer> : null}
    </section>
  );
}
