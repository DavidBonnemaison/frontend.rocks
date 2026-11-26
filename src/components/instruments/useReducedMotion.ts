'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * Optional override context used by /dev/instruments/ to force reduced motion
 * without changing the OS preference.
 */
export const ReducedMotionOverrideContext = createContext<boolean | null>(null);

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  const override = useContext(ReducedMotionOverrideContext);
  const mediaReduced = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return override !== null ? override : mediaReduced;
}
