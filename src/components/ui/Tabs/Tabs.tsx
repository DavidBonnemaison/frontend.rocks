'use client';

import React, { useId, useRef, useState } from 'react';
import './Tabs.css';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  label: string;
  tabs: TabItem[];
  defaultId?: string;
}

export function Tabs({ label, tabs, defaultId }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState<string>(defaultId ?? tabs[0]?.id ?? '');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (tabs.length === 0) return null;

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId)
  );
  const currentTab = tabs[activeIndex] ?? tabs[0];

  const focusTab = (index: number) => {
    const next = tabs[index];
    if (!next) return;
    setActiveId(next.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab((idx + 1) % tabs.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab((idx - 1 + tabs.length) % tabs.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  return (
    <div className="ui-tabs">
      <div className="ui-tabs-list" role="tablist" aria-label={label}>
        {tabs.map((tab, idx) => {
          const selected = tab.id === currentTab.id;
          const tabDomId = `${baseId}-tab-${tab.id}`;
          const panelDomId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tabDomId}
              type="button"
              role="tab"
              className="ui-tabs-tab caps"
              aria-selected={selected}
              aria-controls={panelDomId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => {
        const selected = tab.id === currentTab.id;
        const tabDomId = `${baseId}-tab-${tab.id}`;
        const panelDomId = `${baseId}-panel-${tab.id}`;
        return (
          <div
            key={tab.id}
            id={panelDomId}
            role="tabpanel"
            aria-labelledby={tabDomId}
            tabIndex={0}
            hidden={!selected}
            className="ui-tabs-panel"
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
