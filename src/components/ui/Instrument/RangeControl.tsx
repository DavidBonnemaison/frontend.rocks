'use client';

import React from 'react';
import { Readout } from './Readout';
import './Instrument.css';

export interface RangeControlProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  onChange(v: number): void;
}

export function RangeControl({
  id,
  label,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: RangeControlProps) {
  const steps = step > 0 ? Math.round((max - min) / step) : 0;
  const trackStyle =
    steps > 0 && steps <= 40
      ? ({
          '--range-track-bg': `repeating-linear-gradient(to right, var(--color-ink) 0 1px, transparent 1px calc(100% / ${steps})), var(--color-ink)`,
        } as React.CSSProperties)
      : undefined;

  return (
    <div className="range-control">
      <label htmlFor={id} className="range-control-label caps">
        {label}
      </label>
      <div className="range-control-row">
        <div className="range-control-track-wrap" style={trackStyle}>
          <input
            id={id}
            type="range"
            className="range-control-input"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
        <Readout label={label} value={value} unit={unit} />
      </div>
    </div>
  );
}
