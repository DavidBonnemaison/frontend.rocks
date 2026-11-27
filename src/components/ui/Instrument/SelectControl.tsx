'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import './Instrument.css';

export interface SelectControlProps {
  id: string;
  label: string;
  options: string[];
  value: string;
  testId?: string;
  onChange(v: string): void;
}

export function SelectControl({
  id,
  label,
  options,
  value,
  testId,
  onChange,
}: SelectControlProps) {
  return (
    <div className="select-control">
      <label htmlFor={id} className="select-control-label caps">
        {label}
      </label>
      <div className="select-control-wrap">
        <select
          id={id}
          className="select-control-input meta"
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown size={16} strokeWidth={1.5} className="select-control-icon" aria-hidden="true" />
      </div>
    </div>
  );
}
