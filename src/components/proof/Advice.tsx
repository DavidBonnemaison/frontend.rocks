import React from 'react';
import { hasBlockChild } from './Claim';
import './prose.css';

export function Advice({ children }: { children: React.ReactNode }) {
  if (hasBlockChild(children)) {
    return (
      <aside className="advice" role="note">
        <span className="advice__label">Advice</span>
        {children}
      </aside>
    );
  }
  return <span className="advice advice--inline">{children}</span>;
}
