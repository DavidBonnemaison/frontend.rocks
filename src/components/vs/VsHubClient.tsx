'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, X } from 'lucide-react';
import { formatDomainLabel, formatMaturityLabel } from '@/lib/ui-strings';
import type { VsRelationType } from '@/lib/vs-pairs';
import './vs-hub.css';

export interface VsHubConceptRef {
  id: string;
  title: string;
  domain: string;
  maturityStatus: string;
}

export interface VsHubItem {
  slug: string;
  relationType: VsRelationType;
  note: string;
  primary: VsHubConceptRef;
  secondary: VsHubConceptRef;
  domains: string[];
}

type RelationFilter = 'all' | VsRelationType;

export function VsHubClient({ pairs }: { pairs: VsHubItem[] }) {
  const [relationFilter, setRelationFilter] = useState<RelationFilter>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');

  const allDomains = useMemo(() => {
    const domainSet = new Set<string>();
    for (const pair of pairs) {
      for (const domain of pair.domains) {
        domainSet.add(domain);
      }
    }
    return Array.from(domainSet).sort((a, b) =>
      formatDomainLabel(a).localeCompare(formatDomainLabel(b))
    );
  }, [pairs]);

  const relationCounts = useMemo(() => {
    let replaces = 0;
    let contrasts = 0;
    for (const pair of pairs) {
      if (domainFilter !== 'all' && !pair.domains.includes(domainFilter)) continue;
      if (pair.relationType === 'replaces') replaces += 1;
      else contrasts += 1;
    }
    return {
      all: replaces + contrasts,
      replaces,
      contrasts_with: contrasts,
    };
  }, [pairs, domainFilter]);

  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pair of pairs) {
      if (relationFilter !== 'all' && pair.relationType !== relationFilter) continue;
      for (const domain of pair.domains) {
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
    }
    return counts;
  }, [pairs, relationFilter]);

  const filteredPairs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return pairs.filter((pair) => {
      if (relationFilter !== 'all' && pair.relationType !== relationFilter) {
        return false;
      }
      if (domainFilter !== 'all' && !pair.domains.includes(domainFilter)) {
        return false;
      }
      if (normalizedQuery.length > 0) {
        const haystack = [
          pair.primary.title,
          pair.secondary.title,
          pair.note,
          pair.slug,
          ...pair.domains.map((d) => formatDomainLabel(d)),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [pairs, relationFilter, domainFilter, query]);

  const hasActiveFilters =
    relationFilter !== 'all' || domainFilter !== 'all' || query.trim().length > 0;

  const resetFilters = () => {
    setRelationFilter('all');
    setDomainFilter('all');
    setQuery('');
  };

  return (
    <div>
      <section className="vs-hub-controls" aria-label="Comparison filters">
        <div className="vs-hub-control-row">
          <span className="vs-hub-control-label">Relation</span>
          <div className="vs-hub-filter-group" role="group" aria-label="Filter by relation type">
            <button
              type="button"
              className={`lab-btn${relationFilter === 'all' ? ' lab-btn-primary' : ''}`}
              onClick={() => setRelationFilter('all')}
              aria-pressed={relationFilter === 'all'}
            >
              All ({relationCounts.all})
            </button>
            <button
              type="button"
              className={`lab-btn${relationFilter === 'replaces' ? ' lab-btn-primary' : ''}`}
              onClick={() => setRelationFilter('replaces')}
              aria-pressed={relationFilter === 'replaces'}
            >
              Replaces Legacy ({relationCounts.replaces})
            </button>
            <button
              type="button"
              className={`lab-btn${relationFilter === 'contrasts_with' ? ' lab-btn-primary' : ''}`}
              onClick={() => setRelationFilter('contrasts_with')}
              aria-pressed={relationFilter === 'contrasts_with'}
            >
              Contrasts With ({relationCounts.contrasts_with})
            </button>
          </div>
        </div>

        <div className="vs-hub-control-row">
          <span className="vs-hub-control-label">Domain</span>
          <div className="vs-hub-filter-group" role="group" aria-label="Filter by domain">
            <button
              type="button"
              className={`lab-btn${domainFilter === 'all' ? ' lab-btn-primary' : ''}`}
              onClick={() => setDomainFilter('all')}
              aria-pressed={domainFilter === 'all'}
            >
              All Domains
            </button>
            {allDomains.map((domain) => {
              const count = domainCounts.get(domain) ?? 0;
              return (
                <button
                  key={domain}
                  type="button"
                  className={`lab-btn${domainFilter === domain ? ' lab-btn-primary' : ''}`}
                  onClick={() => setDomainFilter(domain)}
                  aria-pressed={domainFilter === domain}
                >
                  {formatDomainLabel(domain)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="vs-hub-control-row">
          <label htmlFor="vs-hub-search" className="vs-hub-control-label">
            Search
          </label>
          <div className="vs-hub-search-wrap">
            <Search size={14} className="vs-hub-search-icon" aria-hidden="true" />
            <input
              id="vs-hub-search"
              type="search"
              className="vs-hub-search-input"
              placeholder="Filter by primitive, API, or mechanical trade-off..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.length > 0 && (
              <button
                type="button"
                className="vs-hub-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search filter"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="vs-hub-status" aria-live="polite">
        <span>
          Showing <strong>{filteredPairs.length}</strong> of {pairs.length} comparisons
        </span>
        {hasActiveFilters && (
          <button type="button" className="vs-hub-reset" onClick={resetFilters}>
            Reset filters
          </button>
        )}
      </div>

      {filteredPairs.length === 0 ? (
        <div className="vs-hub-empty">
          <p style={{ margin: '0 0 12px' }}>
            No mechanical comparisons match the current filters.
          </p>
          <button type="button" className="lab-btn" onClick={resetFilters}>
            Show all {pairs.length} comparisons
          </button>
        </div>
      ) : (
        <div className="vs-hub-grid">
          {filteredPairs.map((pair) => {
            const isReplaces = pair.relationType === 'replaces';
            return (
              <article key={pair.slug} className="vs-hub-card">
                <div className="vs-hub-card-top">
                  <span
                    className={`badge ${isReplaces ? 'vs-badge-replaces' : 'vs-badge-contrasts'}`}
                  >
                    {isReplaces ? 'Replaces Legacy' : 'Contrasts With'}
                  </span>
                  <div className="vs-hub-domains">
                    {pair.domains.map((domain) => (
                      <span key={domain} className="badge">
                        {formatDomainLabel(domain)}
                      </span>
                    ))}
                  </div>
                </div>

                <h2 className="vs-hub-card-title">
                  <Link href={`/vs/${pair.slug}/`}>
                    {pair.primary.title}
                    <span className="vs-hub-vs-sep">vs</span>
                    {pair.secondary.title}
                  </Link>
                </h2>

                <div className="vs-hub-maturities" aria-label="Concept maturity statuses">
                  <div className="vs-hub-maturity-row">
                    <span className="vs-hub-maturity-name">{pair.primary.title}</span>
                    <span className={`badge badge-${pair.primary.maturityStatus}`}>
                      {formatMaturityLabel(pair.primary.maturityStatus)}
                    </span>
                  </div>
                  <div className="vs-hub-maturity-row">
                    <span className="vs-hub-maturity-name">{pair.secondary.title}</span>
                    <span className={`badge badge-${pair.secondary.maturityStatus}`}>
                      {formatMaturityLabel(pair.secondary.maturityStatus)}
                    </span>
                  </div>
                </div>

                <p className="vs-hub-note">{pair.note}</p>

                <div className="vs-hub-card-footer">
                  <Link href={`/vs/${pair.slug}/`} className="vs-hub-cta">
                    <span>Compare mechanics</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
