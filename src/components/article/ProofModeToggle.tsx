'use client';

import React, { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { SlideSwitch } from '@/components/ui';

const STORAGE_KEY = 'fr-proof-mode';
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function readProofModeSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('proof') === 'on') return true;
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function ProofModeToggle() {
  const id = useId();
  const checked = useSyncExternalStore(subscribe, readProofModeSnapshot, getServerSnapshot);

  useEffect(() => {
    const article = document.querySelector<HTMLElement>('.article');
    if (!article) return;
    if (checked) {
      article.dataset.proofMode = 'on';
    } else {
      delete article.dataset.proofMode;
    }
  }, [checked]);

  const handleChange = useCallback((next: boolean) => {
    try {
      if (next) {
        window.localStorage.setItem(STORAGE_KEY, 'on');
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors in restricted contexts.
    }
    const article = document.querySelector<HTMLElement>('.article');
    if (article) {
      if (next) {
        article.dataset.proofMode = 'on';
      } else {
        delete article.dataset.proofMode;
      }
    }
    notify();
  }, []);

  return (
    <div className="proof-mode-toggle" data-testid="proof-mode-toggle">
      <SlideSwitch
        id={id}
        label="HIGHLIGHT PROVEN"
        checked={checked}
        onChange={handleChange}
      />
    </div>
  );
}
