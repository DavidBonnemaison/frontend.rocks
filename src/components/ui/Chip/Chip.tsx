import React from 'react';
import './Chip.css';

export interface ChipProps {
  tone?: 'neutral' | 'ok' | 'warn' | 'fail' | 'inverse';
  icon?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}

export function Chip({ tone = 'neutral', icon, href, children }: ChipProps) {
  if (href) {
    return (
      <a href={href} className="chip caps" data-tone={tone}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }

  return (
    <span className="chip caps" data-tone={tone}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
