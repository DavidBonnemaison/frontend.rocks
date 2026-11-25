'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { DOMAIN_VALUES, MATURITY_VALUES, type Domain, type MaturityStatus } from '@/lib/schemas';
import { formatDomainLabel, formatMaturityLabel } from '@/lib/ui-strings';
import type { GraphNodeData } from './KnowledgeGraph';

export function ConceptIndex({ nodes }: { nodes: GraphNodeData[] }) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [maturity, setMaturity] = useState<MaturityStatus | 'pattern' | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (domain !== 'all' && n.domain !== domain) return false;
      if (maturity === 'pattern' && n.maturity_status !== null) return false;
      if (maturity !== 'all' && maturity !== 'pattern' && n.maturity_status !== maturity) return false;
      if (q) {
        const hay = `${n.id} ${n.title} ${n.summary_tldr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, query, domain, maturity]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          background: 'var(--surface)',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
        }}
      >
        <input
          type="search"
          placeholder="Filter by concept or symptom…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter concepts"
          className="sim-select"
          style={{ flex: '1 1 240px' }}
        />
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain | 'all')}
          className="sim-select"
          aria-label="Filter by domain"
        >
          <option value="all">All domains</option>
          {DOMAIN_VALUES.map((d) => (
            <option key={d} value={d}>
              {formatDomainLabel(d)}
            </option>
          ))}
        </select>
        <select
          value={maturity}
          onChange={(e) => setMaturity(e.target.value as MaturityStatus | 'pattern' | 'all')}
          className="sim-select"
          aria-label="Filter by maturity"
        >
          <option value="all">All maturities</option>
          {MATURITY_VALUES.map((m) => (
            <option key={m} value={m}>
              {formatMaturityLabel(m)}
            </option>
          ))}
          <option value="pattern">Pattern (no platform feature)</option>
        </select>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        {filtered.map((n) => (
          <Link
            key={n.id}
            href={`/concepts/${n.id}`}
            style={{
              display: 'block',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span className="badge">{formatDomainLabel(n.domain)}</span>
              {n.maturity_status && (
                <span className={`badge badge-${n.maturity_status}`}>
                  {formatMaturityLabel(n.maturity_status)}
                </span>
              )}
            </div>
            <strong>{n.title}</strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {n.summary_tldr}
            </p>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No concepts match this filter.</p>
        )}
      </div>
    </div>
  );
}
