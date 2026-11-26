import React from 'react';
import './Callout.css';

export type CalloutKind = 'advice' | 'warning' | 'note' | 'composite';

export interface CalloutProps {
  kind: CalloutKind;
  title?: string;
  children: React.ReactNode;
}

const DEFAULT_TITLES: Record<CalloutKind, string> = {
  advice: 'ADVICE',
  warning: 'WHEN NOT TO USE',
  note: 'NOTE',
  composite: 'COMPOSITE CASE',
};

export function Callout({ kind, title, children }: CalloutProps) {
  return (
    <aside className="callout" data-kind={kind}>
      <div className="callout-title caps">{title ?? DEFAULT_TITLES[kind]}</div>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
