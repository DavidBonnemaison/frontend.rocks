'use client';

import {
  ALL_EVENTS,
  ANALYTICS_EVENTS,
  EVENT_PROPS,
  PROP_VALUE_RE,
  SERVER_EVENTS,
  TARGET_RE,
  parseEventPath,
  serializeEventPath,
  type AllEvent,
  type AnalyticsEvent,
  type EventProps,
  type ParsedEventPath,
  type ServerEvent,
} from './analytics-events';

export {
  ALL_EVENTS,
  ANALYTICS_EVENTS,
  EVENT_PROPS,
  PROP_VALUE_RE,
  SERVER_EVENTS,
  TARGET_RE,
  parseEventPath,
  serializeEventPath,
  type AllEvent,
  type AnalyticsEvent,
  type EventProps,
  type ParsedEventPath,
  type ServerEvent,
};

type GoatCounter = {
  count: (vars: { path: string; title?: string; event?: boolean }) => void;
};

declare global {
  interface Window {
    goatcounter?: GoatCounter & { no_onload?: boolean };
    __frAnalyticsDebug?: Array<{ path: string; event: boolean }>;
  }
}

const ENDPOINT = process.env.NEXT_PUBLIC_GOATCOUNTER_ENDPOINT;
const queue: Array<{ path: string; title: string; event: boolean }> = [];
const sentOnce = new Set<string>();

function isDebug(): boolean {
  try {
    return window.localStorage.getItem('fr-analytics-debug') === '1';
  } catch {
    return false;
  }
}

function normalizePageviewPath(path: string): string {
  if (!path || path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

export function isAnalyticsEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(ENDPOINT) &&
    window.location.hostname === 'frontend.rocks'
  );
}

function send(item: { path: string; title: string; event: boolean }): void {
  if (typeof window === 'undefined') return;
  if (isDebug()) {
    (window.__frAnalyticsDebug ??= []).push({ path: item.path, event: item.event });
  }
  if (!isAnalyticsEnabled()) return;
  if (window.goatcounter?.count) {
    window.goatcounter.count(item);
  } else {
    queue.push(item);
  }
}

/** Called by `<Analytics />` once `count.js` finishes loading. */
export function flushAnalyticsQueue(): void {
  while (queue.length > 0 && window.goatcounter?.count) {
    const next = queue.shift();
    if (next) window.goatcounter.count(next);
  }
}

export function track(event: AnalyticsEvent, target?: string, props?: EventProps): void {
  send({ path: serializeEventPath(event, target, props), title: event, event: true });
}

export function trackOnce(event: AnalyticsEvent, target?: string, props?: EventProps): void {
  const key = serializeEventPath(event, target, props);
  if (sentOnce.has(key)) return;
  sentOnce.add(key);
  track(event, target, props);
}

export function trackPageview(path: string): void {
  sentOnce.clear();
  send({
    path: normalizePageviewPath(path),
    title: typeof document !== 'undefined' ? document.title : '',
    event: false,
  });
}

/** Reserved for unit tests. */
export function __resetAnalyticsForTests(): void {
  queue.length = 0;
  sentOnce.clear();
}
