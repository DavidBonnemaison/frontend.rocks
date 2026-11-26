import React from 'react';
import type { Domain } from '@/lib/schemas';
import { formatDomainLabel } from '@/lib/ui-strings';
import './DomainLabel.css';

export interface DomainLabelProps {
  domain: Domain;
  href?: string;
}

export function DomainLabel({ domain, href }: DomainLabelProps) {
  const text = formatDomainLabel(domain);
  if (href) {
    return (
      <a href={href} className="domain-label caps">
        {text}
      </a>
    );
  }
  return <span className="domain-label caps">{text}</span>;
}
