'use client';

import { useEffect } from 'react';
import { ANALYTICS_EVENTS, track, type AnalyticsEvent } from '@/lib/analytics';

/**
 * Captures clicks on server-rendered links carrying `data-analytics-event`
 * (and optional `data-analytics-target`) without importing client analytics
 * into Server Components.
 */
export function AnalyticsClickDelegate() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-analytics-event]');
      if (!el) return;
      const event = el.getAttribute('data-analytics-event');
      const target = el.getAttribute('data-analytics-target') ?? undefined;
      if (event && (ANALYTICS_EVENTS as readonly string[]).includes(event)) {
        track(event as AnalyticsEvent, target);
      }
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
