'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { searchItems as runWeightedSearch, type SearchItem } from '@/lib/search';
import './CommandPalette.css';

export type { SearchItem };

let cachedSearchIndex: SearchItem[] | null = null;
let inflightSearchIndex: Promise<SearchItem[]> | null = null;

async function loadSearchIndex(): Promise<SearchItem[]> {
  if (cachedSearchIndex) return cachedSearchIndex;
  if (!inflightSearchIndex) {
    inflightSearchIndex = fetch('/search-index.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load search index (${res.status})`);
        }
        return res.json() as Promise<SearchItem[]>;
      })
      .then((data) => {
        cachedSearchIndex = data;
        return data;
      })
      .catch((err) => {
        inflightSearchIndex = null;
        throw err;
      });
  }
  return inflightSearchIndex;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [items, setItems] = useState<SearchItem[]>(() => cachedSearchIndex ?? []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || cachedSearchIndex) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadSearchIndex()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Unable to load search index. Please try again.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const results = useMemo(() => runWeightedSearch(items, query, 12), [items, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, open]);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cmdk-trigger"
        data-testid="cmdk-trigger"
      >
        <Search size={14} aria-hidden="true" />
        <span>Search…</span>
        <kbd className="kbd cmd-kbd-hint" aria-hidden="true">⌘K</kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Instant search"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '12vh',
            paddingLeft: '16px',
            paddingRight: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '620px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <Search size={16} color="var(--text-muted)" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' && results[selectedIdx]) {
                    e.preventDefault();
                    navigate(results[selectedIdx].href);
                  }
                }}
                placeholder="API, symptom (e.g. z-index header, layout shift) or concept…"
                aria-label="Instant search input"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '0.95rem',
                }}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px' }}>
              {loading && (
                <div
                  role="status"
                  style={{ padding: '18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}
                >
                  Loading search index…
                </div>
              )}
              {!loading && loadError && (
                <div
                  role="alert"
                  style={{ padding: '18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}
                >
                  {loadError}
                </div>
              )}
              {!loading &&
                !loadError &&
                results.map((item, idx) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    data-search-kind={item.kind}
                    data-search-href={item.href}
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: idx === selectedIdx ? 'var(--accent-dim)' : 'transparent',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.title}</div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                    <span className="badge" style={{ flexShrink: 0 }}>
                      {item.badge}
                    </span>
                  </button>
                ))}
              {!loading && !loadError && results.length === 0 && (
                <div style={{ padding: '18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No results for &ldquo;{query}&rdquo;.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
