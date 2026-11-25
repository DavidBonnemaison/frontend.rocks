import React from 'react';
import { hasBlockChild } from './Claim';
import './prose.css';

export function Story({ children }: { children: React.ReactNode }) {
  if (hasBlockChild(children)) {
    return <div className="story">{children}</div>;
  }
  return <span className="story">{children}</span>;
}
