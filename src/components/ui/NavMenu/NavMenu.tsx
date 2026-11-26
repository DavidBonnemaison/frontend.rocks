'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './NavMenu.css';

export interface NavMenuItem {
  href: string;
  title: string;
  description: string;
}

export interface NavMenuProps {
  label: string;
  items: NavMenuItem[];
  hubHref: string;
  active?: boolean;
}

export function NavMenu({ label, items, hubHref, active = false }: NavMenuProps) {
  const uid = useId().replace(/:/g, '');
  const popoverId = `nav-menu-${uid}`;
  const anchorName = `--nav-menu-${uid}`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      setExpanded(toggleEvent.newState === 'open');
    };
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);

  const triggerStyle = { anchorName } as React.CSSProperties & Record<string, string>;
  const panelStyle = { positionAnchor: anchorName } as React.CSSProperties & Record<string, string>;

  return (
    <span className="nav-menu">
      <button
        type="button"
        className="nav-menu-trigger caps"
        popoverTarget={popoverId}
        aria-expanded={expanded}
        aria-controls={popoverId}
        data-active={active ? 'true' : 'false'}
        style={triggerStyle}
      >
        <span>{label}</span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="nav-menu-popover"
        style={panelStyle}
      >
        <ul className="nav-menu-list">
          {items.map((item) => (
            <li key={item.href} className="nav-menu-item">
              <a href={item.href} className="nav-menu-link">
                <span className="nav-menu-title">{item.title}</span>
                <span className="nav-menu-desc meta">{item.description}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href={hubHref} className="nav-menu-hub caps">
          All {label} →
        </a>
      </div>
    </span>
  );
}
