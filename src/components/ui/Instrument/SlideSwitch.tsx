'use client';

import React from 'react';
import './Instrument.css';

export interface SlideSwitchProps {
  id: string;
  label: string;
  offLabel: string;
  onLabel: string;
  checked: boolean;
  onChange(v: boolean): void;
}

export function SlideSwitch({
  id,
  label,
  offLabel,
  onLabel,
  checked,
  onChange,
}: SlideSwitchProps) {
  return (
    <label className="slide-switch" htmlFor={id}>
      <span className="slide-switch-label caps" data-active={!checked ? 'true' : 'false'}>
        {offLabel}
      </span>
      <span className="slide-switch-control">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="slide-switch-input"
          aria-label={label}
          aria-checked={checked}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
      <span className="slide-switch-label caps" data-active={checked ? 'true' : 'false'}>
        {onLabel}
      </span>
    </label>
  );
}
