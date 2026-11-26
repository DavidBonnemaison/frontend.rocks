import React from 'react';

export interface VisuallyHiddenProps {
  as?: 'span' | 'div';
  children: React.ReactNode;
}

export function VisuallyHidden({ as = 'span', children }: VisuallyHiddenProps) {
  const Tag = as;
  return <Tag className="visually-hidden">{children}</Tag>;
}
