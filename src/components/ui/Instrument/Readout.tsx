import React from 'react';
import './Instrument.css';

export interface ReadoutProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'normal' | 'ok' | 'fail';
  digits?: number;
}

const NUMERIC_RE = /^-?[\d.]+$/;

export function Readout({ label, value, unit, tone = 'normal', digits }: ReadoutProps) {
  const raw = String(value);
  const isNumeric = NUMERIC_RE.test(raw);
  const display =
    isNumeric && typeof digits === 'number' && !raw.includes('.') && !raw.startsWith('-')
      ? raw.padStart(digits, '0')
      : raw;
  const accessible = `${label}: ${raw}${unit ? ` ${unit}` : ''}`.trim();

  return (
    <div
      className="readout"
      data-tone={tone}
      data-numeric={isNumeric ? 'true' : 'false'}
      role="status"
      aria-label={accessible}
    >
      <span className="readout-label caps" aria-hidden="true">
        {label}
      </span>
      <span className="readout-row" aria-hidden="true">
        <span className="readout-box">{display}</span>
        {unit ? <span className="readout-unit caps">{unit}</span> : null}
      </span>
    </div>
  );
}
