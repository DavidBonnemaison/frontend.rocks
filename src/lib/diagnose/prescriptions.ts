import type { DetectorId, PrescriptionLink } from './types';

function concept(slug: string, title: string): PrescriptionLink {
  return { type: 'concept', slug, title, href: `/concepts/${slug}/` };
}

function symptom(slug: string, title: string): PrescriptionLink {
  return { type: 'symptom', slug, title, href: `/symptoms/${slug}/` };
}

function autopsy(slug: string, title: string): PrescriptionLink {
  return { type: 'autopsy', slug, title, href: `/autopsies/${slug}/` };
}

/**
 * Verified corpus prescriptions for each deterministic detector.
 * Every slug is checked against content/concepts/, content/autopsies/, and src/config/symptoms.ts.
 */
export const DETECTOR_PRESCRIPTIONS: Record<DetectorId, PrescriptionLink[]> = {
  'long-tasks': [
    concept('event-loop-tasks-microtasks', 'Event Loop, Tasks & Microtasks'),
    concept('long-tasks-and-inp', 'Long Tasks & INP'),
    concept('scheduler-api-yield', 'Prioritized Task Scheduling (scheduler.yield)'),
    symptom('main-thread-freeze', 'Main-Thread Freeze'),
  ],
  'forced-reflow': [
    concept('layout-thrashing', 'Layout Thrashing'),
    concept('render-tree-layout', 'Render Tree & Layout'),
    symptom('forced-layout-reflow', 'Forced Synchronous Reflow'),
    autopsy('fourteen-rerenders-one-click', 'Fourteen Re-renders, One Click'),
  ],
  'paint-compositor': [
    concept('gpu-compositor-layers', 'GPU Compositor Layers'),
    concept('css-containment', 'CSS Containment'),
    symptom('mobile-scroll-stutter', 'Mobile Scroll Stutter'),
    autopsy('mobile-scroll-jank-vram-explosion', 'Mobile Scroll Jank & VRAM Explosion'),
  ],
  'gc-pauses': [
    concept('js-garbage-collection', 'JS Garbage Collection'),
    concept('js-memory-leaks-retainers', 'JS Memory Leaks & Retainers'),
    symptom('spa-memory-leak-oom', 'SPA Memory Leak & OOM'),
    autopsy('eight-hour-spa-memory-leak', 'Eight-Hour SPA Memory Leak'),
  ],
  'request-waterfall': [
    concept('preload-scanner-hints', 'Preload Scanner & Resource Hints'),
    concept('early-hints-103', '103 Early Hints'),
    concept('http2-http3-multiplexing', 'HTTP/2 & HTTP/3 Multiplexing'),
  ],
  'cache-miss': [
    concept('http-caching-directives', 'HTTP Caching Directives'),
    concept('bfcache-navigation', 'Back/Forward Cache (bfcache)'),
    symptom('back-button-reload', 'Back Button Full Reload'),
    autopsy('zombie-bundle-after-deploy', 'Zombie Bundle After Deploy'),
  ],
  'duplicate-mutations': [
    concept('idempotency-optimistic-queues', 'Idempotency & Optimistic Queues'),
    symptom('double-payment-race-condition', 'Double Payment Race Condition'),
    autopsy('double-payment-race-condition', 'Double Payment Race Condition'),
  ],
};
