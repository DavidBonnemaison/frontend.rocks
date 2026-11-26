'use client';

import React, { useEffect, useState } from 'react';
import './Toc.css';

export interface TocItem {
  id: string;
  label: string;
  level?: 2 | 3;
}

export interface TocProps {
  items: TocItem[];
  title?: string;
}

export function Toc({ items, title = 'On this page' }: TocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    if (items.length === 0) return;

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: '-88px 0px -60% 0px',
        threshold: 0.05,
      }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="ui-toc" aria-label={title}>
      <div className="ui-toc-title caps">{title}</div>
      <ul className="ui-toc-list">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id} className="ui-toc-item" data-level={item.level ?? 2}>
              <a
                href={`#${item.id}`}
                className="ui-toc-link meta"
                aria-current={isActive ? 'location' : undefined}
                onClick={() => setActiveId(item.id)}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
