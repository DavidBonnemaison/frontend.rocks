import React from 'react';
import './MetaBlock.css';

export interface MetaBlockRow {
  key: string;
  value: React.ReactNode;
}

export interface MetaBlockProps {
  rows: MetaBlockRow[];
  compact?: boolean;
}

export function MetaBlock({ rows, compact = false }: MetaBlockProps) {
  if (rows.length === 0) return null;

  if (compact) {
    return (
      <div className="meta-block meta" data-compact="true">
        {rows.map((row, idx) => (
          <React.Fragment key={row.key}>
            {idx > 0 ? (
              <span className="meta-block-sep" aria-hidden="true">
                ·
              </span>
            ) : null}
            <span>{row.value}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <dl className="meta-block meta" data-compact="false">
      {rows.map((row) => (
        <div key={row.key} className="meta-block-row">
          <dt className="meta-block-key caps">{row.key}</dt>
          <dd className="meta-block-value">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
