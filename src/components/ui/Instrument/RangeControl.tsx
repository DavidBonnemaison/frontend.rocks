'use client';

import React, { useEffect, useRef } from 'react';
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
  testId?: string;
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
  testId,
  onChange,
}: RangeControlProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleNative = () => {
      const parsed = Number(el.value);
      if (Number.isFinite(parsed)) onChangeRef.current(parsed);
    };
    el.addEventListener('input', handleNative);
    el.addEventListener('change', handleNative);
    return () => {
      el.removeEventListener('input', handleNative);
      el.removeEventListener('change', handleNative);
    };
  }, []);

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
            ref={inputRef}
            id={id}
            type="range"
            className="range-control-input"
            data-testid={testId}
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
