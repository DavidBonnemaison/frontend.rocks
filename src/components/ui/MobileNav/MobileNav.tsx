'use client';

import React, { useId, useState } from 'react';
import { Menu } from 'lucide-react';
import { Dialog } from '../Dialog/Dialog';
import type { NavMenuProps } from '../NavMenu/NavMenu';
import './MobileNav.css';

export interface MobileNavSection {
  label: string;
  hubHref: string;
  items: NavMenuProps['items'];
}

export interface MobileNavProps {
  sections: MobileNavSection[];
  footer?: React.ReactNode;
}

export function MobileNav({ sections, footer }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <div className="mobile-nav">
      <button
        type="button"
        className="mobile-nav-trigger"
        aria-label="Open navigation menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="caps">
          Navigation
        </h2>
        <nav aria-label="Mobile navigation">
          {sections.map((section) => (
            <div key={section.label} className="mobile-nav-section">
              <div className="mobile-nav-section-head">
                <span className="caps">{section.label}</span>
                <a href={section.hubHref} className="caps" onClick={() => setOpen(false)}>
                  Hub →
                </a>
              </div>
              <ul className="mobile-nav-list">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="mobile-nav-link"
                      onClick={() => setOpen(false)}
                    >
                      <span>{item.title}</span>
                      <span className="meta">{item.description}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {footer ? <div className="mobile-nav-footer">{footer}</div> : null}
      </Dialog>
    </div>
  );
}
