'use client';

import React, { useId, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { track } from '@/lib/analytics';
import { SRGB } from '@/lib/design/tokens.generated';
import { SlideSwitch } from '../Instrument/SlideSwitch';
import { THEME_STORAGE_KEY } from './theme-boot';
import './ThemeToggle.css';

export interface ThemeToggleProps {
  compact?: boolean;
}

const listeners = new Set<() => void>();

function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getThemeSnapshot(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') {
    return 'dark';
  }
  return 'light';
}

function getServerThemeSnapshot(): 'light' | 'dark' {
  return 'light';
}

function applyTheme(next: 'light' | 'dark'): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', SRGB[next].paper);
    }
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage unavailable
  }
  for (const listener of listeners) {
    listener();
  }
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const id = useId();
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const dark = theme === 'dark';

  const handleChange = (checked: boolean) => {
    const next = checked ? 'dark' : 'light';
    applyTheme(next);
    track('theme_toggle');
  };

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Dark theme"
        className="theme-toggle-compact"
        onClick={() => handleChange(!dark)}
      >
        {dark ? (
          <Moon size={16} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Sun size={16} strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div className="theme-toggle">
      <SlideSwitch
        id={`theme-toggle-${id}`}
        label="Dark theme"
        offLabel="LIGHT"
        onLabel="DARK"
        checked={dark}
        onChange={handleChange}
      />
    </div>
  );
}
