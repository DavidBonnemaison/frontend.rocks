import React from 'react';
import './DataTable.css';

export interface DataTableColumn {
  key: string;
  label: string;
  align?: 'start' | 'end';
  mono?: boolean;
}

export interface DataTableProps {
  caption: string;
  columns: DataTableColumn[];
  rows: Array<Record<string, React.ReactNode>>;
}

export function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    <div className="data-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="data-table">
        <caption className="meta">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className="caps" data-align={col.align ?? 'start'}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  data-align={col.align ?? 'start'}
                  data-mono={col.mono ? 'true' : 'false'}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
