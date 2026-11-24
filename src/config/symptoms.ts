import type { PageProofStatus } from '../lib/schemas';

export interface ProductionSymptomConfig {
  slug: string;
  proof_status: PageProofStatus;
  search_title: string;
  devtools_signature: string;
  autopsy_ids: string[];
  concept_ids: string[];
  summary: string;
  featured?: boolean;
}

export const PRODUCTION_SYMPTOMS: ProductionSymptomConfig[] = [
  {
    slug: 'z-index-ignored',
    proof_status: 'unverified',
    featured: true,
    search_title: 'My z-index: 9999 is ignored behind a sticky header',
    devtools_signature:
      'Computed z-index: 9999, yet element paints underneath sibling with z-index: 10 (isolated stacking context via transform/opacity/filter)',
    autopsy_ids: ['zindex-9999-tooltip-war'],
    concept_ids: [
      'css-stacking-context',
      'gpu-compositor-layers',
      'react-portal-zindex-legacy',
      'browser-top-layer',
    ],
    summary:
      'A parent with transform, opacity < 1, will-change, or filter creates an isolated stacking context that traps child z-index values inside its subtree.',
  },
  {
    slug: 'mobile-scroll-stutter',
    proof_status: 'unverified',
    featured: true,
    search_title: 'Scrolling stutters at 11 FPS on mobile and kills the tab',
    devtools_signature:
      'DevTools Layers panel > 400 MB GPU memory; Performance trace shows Paint + Composite Layers > 35 ms per frame',
    autopsy_ids: ['mobile-scroll-jank-vram-explosion'],
    concept_ids: [
      'gpu-compositor-layers',
      'paint-rasterization',
      'css-containment',
      'content-visibility',
    ],
    summary:
      'Animating layout properties or over-promoting cards with will-change saturates mobile VRAM and forces main-thread rasterization on every scroll tick.',
  },
  {
    slug: 'main-thread-freeze',
    proof_status: 'unverified',
    featured: true,
    search_title: 'An async loop freezes the browser main thread completely',
    devtools_signature:
      'Long Task > 5000 ms; DevTools Performance shows continuous Microtask Checkpoint draining with zero Paint frames',
    autopsy_ids: [],
    concept_ids: [
      'event-loop-tasks-microtasks',
      'long-tasks-and-inp',
      'execution-context-call-stack',
    ],
    summary:
      'Unbounded Promise/microtask chains starve the rendering step between macrotasks and block all user input until the microtask queue drains.',
  },
  {
    slug: 'forced-layout-reflow',
    proof_status: 'unverified',
    featured: true,
    search_title: 'UI updates trigger full-page forced synchronous reflows',
    devtools_signature:
      'DevTools Performance warning: "Forced reflow is a likely performance bottleneck" inside Recalculate Style + Layout',
    autopsy_ids: ['fourteen-rerenders-one-click'],
    concept_ids: [
      'layout-thrashing',
      'render-tree-layout',
      'requestanimationframe-vsync',
    ],
    summary:
      'Interleaving DOM style writes with geometric reads such as offsetHeight or getBoundingClientRect forces synchronous Blink layout recalculations.',
  },
  {
    slug: 'back-button-reload',
    proof_status: 'unverified',
    featured: true,
    search_title: 'Browser Back button reloads the entire page from scratch',
    devtools_signature:
      'DevTools Application > Back/forward cache: NotRestoredReasons = ["unload-handler"] or Cache-Control: no-store',
    autopsy_ids: ['zombie-bundle-after-deploy'],
    concept_ids: [
      'bfcache-navigation',
      'http-caching-directives',
      'beacon-api-visibilitychange',
    ],
    summary:
      'Attaching unload listeners, sending Cache-Control: no-store, or holding open IndexedDB locks disqualifies the page from instant Back/Forward Cache snapshots.',
  },
  {
    slug: 'wrong-click-target',
    proof_status: 'unverified',
    featured: true,
    search_title: 'Click handler fires on the wrong element or misses Shadow DOM target',
    devtools_signature:
      'event.target !== event.currentTarget; Shadow DOM event.target retargeted to host element outside shadow root',
    autopsy_ids: ['double-payment-race-condition'],
    concept_ids: [
      'dom-event-propagation',
      'shadow-dom-encapsulation',
      'pointer-events-touch-action',
    ],
    summary:
      'Capture, bubbling, and Shadow DOM event retargeting alter event.target versus event.currentTarget along the composed path.',
  },
  {
    slug: 'double-payment-race-condition',
    proof_status: 'unverified',
    search_title: 'Rapid double-click charges the user twice despite disabled button',
    devtools_signature:
      'Network tab shows 2 concurrent POST /checkout requests within 12 ms before React state flush disables the submit button',
    autopsy_ids: ['double-payment-race-condition'],
    concept_ids: [
      'dom-event-propagation',
      'debounce-throttle-raf-coalescing',
      'finite-state-machines-ui',
      'abortcontroller-cancellation',
      'idempotency-optimistic-queues',
    ],
    summary:
      'Asynchronous React state updates lag behind synchronous DOM click dispatch, allowing duplicate mutations unless guarded by state machines and idempotency keys.',
  },
  {
    slug: 'spa-memory-leak-oom',
    proof_status: 'unverified',
    search_title: 'SPA dashboard climbs to 2.4 GB RAM and crashes with Aw, Snap!',
    devtools_signature:
      'DevTools Memory Heap Snapshot shows growing Detached HTMLDivElement retainers and uncancelled AbortController/Observer closures',
    autopsy_ids: ['eight-hour-spa-memory-leak'],
    concept_ids: [
      'js-garbage-collection',
      'js-memory-leaks-retainers',
      'stale-closures-hooks',
      'mutation-observer',
      'abortcontroller-cancellation',
    ],
    summary:
      'Long-lived event listeners, uncleaned MutationObservers, and stale hook closures retain detached DOM subtrees across route transitions until V8 hits the heap limit.',
  },
  {
    slug: 'inp-long-task-on-click',
    proof_status: 'unverified',
    search_title: 'Single filter click freezes UI for 180+ ms INP with visible CLS jump',
    devtools_signature:
      'Web Vitals INP > 200 ms (Processing Duration > 140 ms) + CLS > 0.1 during synchronous state commit and layout read',
    autopsy_ids: ['fourteen-rerenders-one-click'],
    concept_ids: [
      'css-custom-properties-cascade',
      'virtual-dom-reconciliation',
      'layout-thrashing',
      'long-tasks-and-inp',
      'concurrent-rendering-lanes',
    ],
    summary:
      'Cascading custom property invalidations and synchronous Virtual DOM reconciliation combine with layout thrashing to blow past the 200 ms INP budget.',
  },
  {
    slug: 'chunk-load-error-after-deploy',
    proof_status: 'unverified',
    search_title: 'ChunkLoadError or corrupt IndexedDB state after a production deploy',
    devtools_signature:
      'Uncaught ChunkLoadError: Loading chunk 42 failed (404) / Failed to fetch dynamically imported module',
    autopsy_ids: ['zombie-bundle-after-deploy'],
    concept_ids: [
      'service-worker-lifecycle',
      'http-caching-directives',
      'es-modules-live-bindings',
      'client-storage-schema-migrations',
    ],
    summary:
      'Cached HTML shells or waiting Service Workers reference old hashed JS chunks removed on the CDN, breaking lazy imports and client schema expectations.',
  },
  {
    slug: 'hydration-mismatch-input-wiped',
    proof_status: 'unverified',
    search_title: 'SSR page flickers on load and wipes typed text in form inputs',
    devtools_signature:
      'Warning: Text content did not match. Server vs Client / Hydration failed because the initial UI does not match what was rendered on the server',
    autopsy_ids: ['hydration-flicker-and-bailout'],
    concept_ids: [
      'streaming-ssr-flushing',
      'resumability-vs-hydration',
      'hydration-mismatch-mechanics',
      'url-as-state-store',
      'client-side-router-internals',
    ],
    summary:
      'Divergent server/client trees trigger React hydration bailout, discarding SSR DOM nodes and resetting any user input entered before JS finished booting.',
  },
  {
    slug: 'green-ci-broken-prod-dropdown',
    proof_status: 'unverified',
    search_title: '100% of unit tests pass in JSDOM while mobile dropdown fails in prod',
    devtools_signature:
      'Vitest/Jest JSDOM suite green; Safari/Chrome mobile throws Unable to preventDefault inside passive event listener or misses hit-testing',
    autopsy_ids: ['green-ci-broken-prod-jsdom'],
    concept_ids: [
      'render-tree-layout',
      'passive-event-listeners',
      'simulated-dom-vs-real-engines',
      'async-determinism-fake-timers',
      'a11y-tree-queries-vs-dom-selectors',
    ],
    summary:
      'JSDOM stubs layout geometry, passive touch listeners, and compositor hit-testing, masking real browser failures until tested in an actual engine.',
  },
  {
    slug: 'offline-sync-data-overwrite',
    proof_status: 'unverified',
    search_title: 'Offline edit silently overwrites teammate changes on reconnect',
    devtools_signature:
      'IndexedDB VersionChange / Last-Write-Wins PUT overwrites server revision without conflict detection or CRDT merge',
    autopsy_ids: ['offline-first-conflict-storm'],
    concept_ids: [
      'indexeddb-transactions-quotas',
      'local-first-sync-crdt',
      'broadcast-channel-web-locks',
      'idempotency-optimistic-queues',
    ],
    summary:
      'Naive offline mutation replay without causal vector clocks, CRDTs, or cross-tab Web Locks clobbers concurrent edits once connectivity returns.',
  },
  {
    slug: 'websocket-multi-tab-storm',
    proof_status: 'unverified',
    search_title: 'Opening multiple tabs exhausts WebSocket limits and freezes UI',
    devtools_signature:
      '8x duplicate wss:// connections per browser; 400 msg/s JSON.parse bursts saturate main thread at > 95% CPU',
    autopsy_ids: ['multi-tab-websocket-thundering-herd'],
    concept_ids: [
      'broadcast-channel-web-locks',
      'cross-tab-leader-election',
      'dedicated-web-workers',
      'streams-api-backpressure',
      'realtime-streams-backpressure-jitter',
    ],
    summary:
      'Without cross-tab leader election and Worker-offloaded stream backpressure, every open tab duplicates realtime sockets and main-thread parsing.',
  },
  {
    slug: 'third-party-xss-exfiltration',
    proof_status: 'unverified',
    search_title: 'Third-party script injects inline XSS via innerHTML sink',
    devtools_signature:
      'SecurityPolicyViolation / TypeError: This document requires TrustedHTML assignment on Element.innerHTML',
    autopsy_ids: ['third-party-script-xss-takeover'],
    concept_ids: [
      'dom-xss-trusted-types',
      'csp-nonces-strict-dynamic',
      'prototype-chain-lookup',
      'cross-origin-isolation-coop-coep',
      'runtime-boundary-validation',
    ],
    summary:
      'Unsanitized DOM sinks and prototype pollution allow compromised third-party widgets to execute arbitrary scripts unless locked down by Trusted Types and strict CSP.',
  },
  {
    slug: 'large-grid-sort-blocks-ui',
    proof_status: 'unverified',
    search_title: 'Sorting 100k table rows drops the UI to 4 FPS on the main thread',
    devtools_signature:
      'Long Task > 250 ms during Array.prototype.sort; structuredClone serialization spikes GC pause time',
    autopsy_ids: ['zero-main-thread-ui-worker'],
    concept_ids: [
      'dedicated-web-workers',
      'typed-arrays-zero-copy',
      'opfs-origin-private-fs',
      'wasm-js-boundary-overhead',
      'actor-over-worker-architecture',
    ],
    summary:
      'Moving heavy sorting and persistence off the main thread into Dedicated Workers with Transferable TypedArrays and OPFS eliminates UI frame drops.',
  },
  {
    slug: 'cls-font-swap-layout-shift',
    proof_status: 'unverified',
    search_title: 'Web font swap causes sudden text jump and high CLS score',
    devtools_signature:
      'Web Vitals CLS > 0.1; Performance Layout Shift record attributed to @font-face swap from fallback sans-serif',
    autopsy_ids: [],
    concept_ids: ['font-loading-cls', 'core-web-vitals-mechanics', 'preload-scanner-hints'],
    summary:
      'Late-discovered web fonts with mismatched metric overrides resize line boxes when swapping in, causing measurable Cumulative Layout Shift.',
  },
  {
    slug: 'cors-preflight-blocks-request',
    proof_status: 'unverified',
    search_title: 'API request fails with CORS preflight OPTIONS 403 or missing header',
    devtools_signature:
      'Access to fetch at ... has been blocked by CORS policy: Response to preflight request does not pass access control check',
    autopsy_ids: [],
    concept_ids: [
      'cors-preflight-samesite',
      'http-caching-directives',
      'http2-http3-multiplexing',
    ],
    summary:
      'Non-simple headers or methods trigger a mandatory OPTIONS preflight that fails when the server omits Access-Control-Allow-* or mishandles credentials.',
  },
  {
    slug: 'stale-closure-reads-old-state',
    proof_status: 'unverified',
    search_title: 'Async callback or interval reads stale React state after update',
    devtools_signature:
      'Logged state value inside setInterval/addEventListener stays stuck at initial render value despite subsequent setState calls',
    autopsy_ids: [],
    concept_ids: [
      'stale-closures-hooks',
      'execution-context-call-stack',
      'promises-async-await-internals',
    ],
    summary:
      'Closures capture the lexical environment of the render in which they were created, reading outdated bindings when effects omit dependencies or refs.',
  },
  {
    slug: 'mobile-100vh-cuts-off-toolbar',
    proof_status: 'unverified',
    search_title: 'height: 100vh overflows behind mobile browser address bar',
    devtools_signature:
      'Fixed bottom CTA clipped below mobile Safari/Chrome dynamic toolbar when layout viewport differs from visual viewport',
    autopsy_ids: [],
    concept_ids: [
      'dynamic-viewport-units',
      'flexbox-intrinsic-sizing',
      'css-scroll-snap',
    ],
    summary:
      'Classic 100vh maps to the large viewport height, extending under retracting mobile toolbars unless replaced with dvh or svh units.',
  },
  {
    slug: 'modal-focus-escapes-behind-backdrop',
    proof_status: 'unverified',
    search_title: 'Keyboard Tab focus escapes modal dialog into background page',
    devtools_signature:
      'document.activeElement moves behind modal overlay; screen reader navigates background landmarks while dialog is open',
    autopsy_ids: ['zindex-9999-tooltip-war'],
    concept_ids: [
      'browser-top-layer',
      'inert-attribute-focus',
      'native-dialog-element',
      'roving-tabindex-focus-order',
    ],
    summary:
      'Custom div modals fail to mark background subtrees inert or use the native Top Layer, allowing keyboard focus and assistive tech to leak behind the backdrop.',
  },
  {
    slug: 'regex-hangs-tab-on-input',
    proof_status: 'unverified',
    search_title: 'Validation regex hangs the browser tab on crafted user input (ReDoS)',
    devtools_signature:
      'Main thread frozen 100% inside RegExp.prototype.test; DevTools Flame Chart shows catastrophic backtracking',
    autopsy_ids: [],
    concept_ids: [
      'regexp-backtracking-unicode',
      'long-tasks-and-inp',
      'runtime-boundary-validation',
    ],
    summary:
      'Nested quantifiers in NFA regular expressions cause exponential backtracking on near-matching strings, locking up the JS thread.',
  },
  {
    slug: 'css-specificity-override-fails',
    proof_status: 'unverified',
    search_title: 'Utility CSS classes fail to override component styles despite source order',
    devtools_signature:
      'DevTools Styles pane shows utility rule crossed out due to higher selector specificity (0,2,0) vs (0,1,0)',
    autopsy_ids: [],
    concept_ids: [
      'css-specificity-inheritance',
      'css-cascade-layers',
      'css-custom-properties-cascade',
    ],
    summary:
      'Unlayered compound selectors outrank later single-class utilities in the cascade unless isolated with @layer declarations.',
  },
  {
    slug: 'service-worker-serves-stale-app',
    proof_status: 'unverified',
    search_title: 'Users remain stuck on old app version after deploy due to Service Worker',
    devtools_signature:
      'DevTools Application > Service Workers shows new worker stuck in "waiting to activate" while tabs serve cached old bundle',
    autopsy_ids: ['zombie-bundle-after-deploy'],
    concept_ids: [
      'service-worker-lifecycle',
      'http-caching-directives',
      'cdn-edge-cache-keys',
    ],
    summary:
      'A new Service Worker waits until all controlled tabs close unless skipWaiting and client reload coordination are handled cleanly.',
  },
  {
    slug: 'useeffect-infinite-loop-429',
    proof_status: 'unverified',
    search_title: 'useEffect dependency loop triggers Maximum update depth exceeded and 429 API burst',
    devtools_signature:
      'Console: "Maximum update depth exceeded"; Network waterfall shows 47+ uncancelled GET /api/items requests returning HTTP 429 Too Many Requests',
    autopsy_ids: ['useeffect-dependency-loop-ddos'],
    concept_ids: [
      'execution-context-call-stack',
      'stale-closures-hooks',
      'virtual-dom-reconciliation',
      'server-state-cache-machines',
      'abortcontroller-cancellation',
    ],
    summary:
      'Allocating a fresh filter object literal per render fails Object.is() in useEffect, rescheduling commits and uncancelled fetches until API rate limits trip.',
  },
];

export function getSymptomBySlug(slug: string): ProductionSymptomConfig | undefined {
  return PRODUCTION_SYMPTOMS.find((s) => s.slug === slug);
}

export function getFeaturedSymptoms(): ProductionSymptomConfig[] {
  return PRODUCTION_SYMPTOMS.filter((s) => s.featured);
}
