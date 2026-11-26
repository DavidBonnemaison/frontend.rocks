'use client';

import React from 'react';
import './Instrument.css';

export interface ModeSelectorProps<T extends string> {
  id: string;
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange(v: T): void;
}

export function ModeSelector<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: ModeSelectorProps<T>) {
  return (
    <fieldset className="mode-selector">
      <legend className="mode-selector-legend caps">{label}</legend>
      <div className="mode-selector-group">
        {options.map((opt) => {
          const active = opt.value === value;
          const optId = `${id}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              className="mode-selector-option caps"
              data-active={active ? 'true' : 'false'}
            >
              <input
                id={optId}
                type="radio"
                name={id}
                value={opt.value}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="mode-selector-input"
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
