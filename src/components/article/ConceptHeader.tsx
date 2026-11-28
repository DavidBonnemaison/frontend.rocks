import React from 'react';
import { Breadcrumb, Callout, DomainLabel } from '@/components/ui';
import type { Domain } from '@/lib/schemas';
import { formatDomainLabel } from '@/lib/ui-strings';
import './ArticleBlocks.css';

export interface ConceptHeaderProps {
  domain: Domain;
  title: string;
  tldr: string;
}

export function ConceptHeader({ domain, title, tldr }: ConceptHeaderProps) {
  return (
    <header className="concept-header is-header" data-block="header">
      <Breadcrumb
        items={[
          { label: 'Learn', href: '/concepts/' },
          { label: 'Concepts', href: '/concepts/' },
          { label: formatDomainLabel(domain), href: `/concepts/?domain=${domain}` },
        ]}
      />
      <DomainLabel domain={domain} href={`/concepts/?domain=${domain}`} />
      <h1 className="concept-header-title">{title}</h1>
      <p className="concept-header-tldr">{tldr}</p>
    </header>
  );
}

export function ConceptStatusBanners({
  isObsolete,
  supersededTargets,
  replacesTargets,
  supersededPrefix,
  legacyPatternText,
  replacesPrefix,
}: {
  isObsolete: boolean;
  supersededTargets: Array<{ id: string; title: string }>;
  replacesTargets: Array<{ id: string; title: string }>;
  supersededPrefix: string;
  legacyPatternText: string;
  replacesPrefix: string;
}) {
  if (isObsolete) {
    return (
      <Callout kind="warning" title="Superseded pattern">
        <p>
          <strong>{supersededPrefix}</strong>{' '}
          {supersededTargets.length > 0 ? (
            supersededTargets.map((target, idx) => (
              <React.Fragment key={target.id}>
                {idx > 0 && ', '}
                <a href={`/concepts/${target.id}/`}>{target.title}</a>
              </React.Fragment>
            ))
          ) : (
            <span>{legacyPatternText}</span>
          )}
        </p>
      </Callout>
    );
  }
  if (replacesTargets.length > 0) {
    return (
      <Callout kind="note" title="Replaces">
        <p>
          <strong>{replacesPrefix}</strong>{' '}
          {replacesTargets.map((target, idx) => (
            <React.Fragment key={target.id}>
              {idx > 0 && ', '}
              <a href={`/concepts/${target.id}/`}>{target.title}</a>
            </React.Fragment>
          ))}
        </p>
      </Callout>
    );
  }
  return null;
}
