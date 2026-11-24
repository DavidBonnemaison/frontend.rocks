'use client';

import React, { useEffect, useState } from 'react';

export interface TocItem {
  id: string;
  label: string;
}

interface ConceptTocProps {
  items: TocItem[];
}

export function ConceptToc({ items }: ConceptTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    if (items.length === 0) return;

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

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
    <nav className="concept-toc" aria-label="On this page">
      <div className="concept-toc-heading">On this page</div>
      <ul className="concept-toc-list">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`concept-toc-link${isActive ? ' active' : ''}`}
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
