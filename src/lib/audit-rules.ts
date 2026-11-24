import { z } from 'zod';
import {
  getAllAutopsies,
  getAllConcepts,
  type LoadedAutopsy,
  type LoadedConcept,
} from './content-loader';
import {
  PRODUCTION_SYMPTOMS,
  type ProductionSymptomConfig,
} from '../config/symptoms';
import { SITE_URL } from './seo-exports';

export const AUDIT_CATEGORIES = [
  'IndexedDB & Storage',
  'Service Workers & Caching',
  'Rendering & CSS Compositor',
  'React / State & Race Conditions',
  'Security & A11y',
  'Testing Fidelity',
  'Browser Lifecycle & Performance',
] as const;

export const AuditCategorySchema = z.enum(AUDIT_CATEGORIES);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

export const AUDIT_SEVERITIES = ['critical', 'high', 'medium'] as const;
export const AuditSeveritySchema = z.enum(AUDIT_SEVERITIES);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const AuditCanonicalUrlsSchema = z.object({
  autopsies: z.array(z.string().url()),
  concepts: z.array(z.string().url()).min(1),
  symptoms: z.array(z.string().url()),
});
export type AuditCanonicalUrls = z.infer<typeof AuditCanonicalUrlsSchema>;

export const AuditRuleSchema = z.object({
  id: SlugSchema,
  title: z.string().min(5),
  category: AuditCategorySchema,
  severity: AuditSeveritySchema,
  detection_signals: z.array(z.string().min(3)).min(1),
  pattern_hints: z.array(z.string().min(2)).min(1),
  trigger: z.string().min(10),
  root_cause: z.string().min(10),
  how_to_spot: z.string().min(10),
  fix: z.string().min(10),
  autopsy_ids: z.array(SlugSchema),
  concept_ids: z.array(SlugSchema).min(1),
  symptom_slugs: z.array(SlugSchema),
  canonical_urls: AuditCanonicalUrlsSchema,
});
export type AuditRule = z.infer<typeof AuditRuleSchema>;

export const AuditRulesCatalogSchema = z.object({
  generated_at: z.string().min(1),
  version: z.string().min(1),
  rule_count: z.number().int().min(0).max(30),
  categories: z.array(AuditCategorySchema).min(0),
  rules: z.array(AuditRuleSchema).min(0).max(30),
});
export type AuditRulesCatalog = z.infer<typeof AuditRulesCatalogSchema>;

export const AUDIT_CATALOG_VERSION = '1.0.0';

interface RuleBlueprint {
  id: string;
  title: string;
  category: AuditCategory;
  severity: AuditSeverity;
  primaryAutopsyId?: string;
  primarySymptomSlug?: string;
  extraAutopsyIds?: string[];
  extraConceptIds?: string[];
  extraSymptomSlugs?: string[];
  detection_signals: string[];
  pattern_hints: string[];
  triggerOverride?: string;
  rootCauseOverride?: string;
  howToSpotOverride?: string;
  fixOverride?: string;
}

const RULE_BLUEPRINTS: readonly RuleBlueprint[] = [
  // --- 1. IndexedDB & Storage ---
  {
    id: 'idb-open-without-versionchange',
    title: 'indexedDB.open() without db.onversionchange or pagehide close',
    category: 'IndexedDB & Storage',
    severity: 'critical',
    primaryAutopsyId: 'indexeddb-versionchange-deadlock',
    extraSymptomSlugs: ['chunk-load-error-after-deploy'],
    detection_signals: [
      'indexedDB.open(name, version) called without attaching db.onversionchange = () => db.close()',
      'Open IDBDatabase handle kept alive across pagehide/bfcache transitions',
      'Missing onblocked handler or BroadcastChannel reload coordination during schema bumps',
    ],
    pattern_hints: ['indexedDB.open(', 'onversionchange', 'pagehide', 'onblocked'],
  },
  {
    id: 'idb-lww-full-document-put-sync',
    title: 'Offline-first full-document PUT on online event without conflict resolution',
    category: 'IndexedDB & Storage',
    severity: 'high',
    primaryAutopsyId: 'offline-first-conflict-storm',
    primarySymptomSlug: 'offline-sync-data-overwrite',
    detection_signals: [
      "window.addEventListener('online', ...) replaying full-document PUT payloads",
      'Last-Write-Wins sync without revision vector, CRDT operation deltas, or navigator.locks leader election',
    ],
    pattern_hints: ["addEventListener('online'", 'method: "PUT"', 'navigator.locks'],
  },
  {
    id: 'idb-heavy-sync-in-upgradeneeded',
    title: 'Async network work or heavy data backfill inside IndexedDB onupgradeneeded',
    category: 'IndexedDB & Storage',
    severity: 'medium',
    primaryAutopsyId: 'indexeddb-versionchange-deadlock',
    extraConceptIds: ['client-storage-schema-migrations', 'indexeddb-transactions-quotas'],
    detection_signals: [
      'await fetch(...) or multi-record backfill loops inside onupgradeneeded',
      'Long-running versionchange transaction blocking every other tab on the origin',
    ],
    pattern_hints: ['onupgradeneeded', 'upgrade(', 'createObjectStore'],
    triggerOverride:
      'Running async fetches or bulk record backfills inside an IndexedDB onupgradeneeded handler',
    rootCauseOverride:
      'Versionchange transactions auto-commit on unhandled async ticks or hold the origin-wide upgrade lock across all open tabs',
    howToSpotOverride:
      'Inspect onupgradeneeded callbacks for fetch(), Promise.all(), or cursor loops over thousands of records',
    fixOverride:
      'Keep onupgradeneeded strictly to synchronous DDL (stores/indexes) and run data backfills afterward under a navigator.locks lease',
  },

  // --- 2. Service Workers & Caching ---
  {
    id: 'sw-uncoordinated-skipwaiting-claim',
    title: 'self.skipWaiting() + clients.claim() without version coordination',
    category: 'Service Workers & Caching',
    severity: 'critical',
    primaryAutopsyId: 'zombie-bundle-after-deploy',
    extraAutopsyIds: ['indexeddb-versionchange-deadlock'],
    primarySymptomSlug: 'service-worker-serves-stale-app',
    detection_signals: [
      'self.skipWaiting() in install event paired with self.clients.claim() in activate event',
      'No controllerchange listener or user-prompted reload handshake to align JS bundle and IndexedDB schema versions',
    ],
    pattern_hints: ['self.skipWaiting()', 'clients.claim()', 'controllerchange'],
    triggerOverride:
      'Calling self.skipWaiting() and clients.claim() unconditionally on every Service Worker deploy',
    rootCauseOverride:
      'A newly activated worker takes control of already-running tabs mid-session, mixing v1 JS modules in memory with v2 cached chunks and v2 IndexedDB schemas',
    howToSpotOverride:
      'Search sw.js/service-worker.ts for skipWaiting() and clients.claim() without a postMessage/controllerchange reload gate',
    fixOverride:
      'Coordinate activation via postMessage + controllerchange reload, or close open IndexedDB handles and revalidate versioned assets before claiming clients',
  },
  {
    id: 'sw-stale-chunk-pruning-cache-mismatch',
    title: 'Cached HTML shell referencing pruned hashed JS chunks after deploy',
    category: 'Service Workers & Caching',
    severity: 'high',
    primaryAutopsyId: 'zombie-bundle-after-deploy',
    primarySymptomSlug: 'chunk-load-error-after-deploy',
    detection_signals: [
      'Cache-first Service Worker strategy applied to navigation/HTML shell requests',
      'Dynamic import() or lazy routes without ChunkLoadError recovery or N-1/N-2 CDN asset retention',
    ],
    pattern_hints: ['request.mode === "navigate"', 'caches.match(', 'import('],
  },
  {
    id: 'http-no-store-kills-bfcache',
    title: 'Cache-Control: no-store on HTML documents disqualifying bfcache',
    category: 'Service Workers & Caching',
    severity: 'medium',
    primarySymptomSlug: 'back-button-reload',
    extraAutopsyIds: ['zombie-bundle-after-deploy'],
    extraConceptIds: ['bfcache-navigation', 'http-caching-directives'],
    detection_signals: [
      'Cache-Control header containing no-store on regular navigable HTML routes',
      'DevTools Application > Back/forward cache reporting NotRestoredReasons = ["no-store"]',
    ],
    pattern_hints: ['no-store', 'Cache-Control', 'pageshow'],
    triggerOverride:
      'Setting Cache-Control: no-store on standard application HTML responses instead of no-cache or private, max-age=0',
    rootCauseOverride:
      'Browsers refuse to snapshot pages with Cache-Control: no-store into the Back/Forward Cache, forcing full document reloads on Back/Forward navigation',
    howToSpotOverride:
      'Check response headers in Next.js/Express/CDN config and DevTools Application -> Back/forward cache',
    fixOverride:
      'Use Cache-Control: private, no-cache (or must-revalidate) for dynamic HTML and reserve no-store strictly for high-sensitivity banking/auth views',
  },

  // --- 3. Rendering & CSS Compositor ---
  {
    id: 'css-static-will-change-on-lists',
    title: 'Static will-change on repeated list/card elements saturating mobile VRAM',
    category: 'Rendering & CSS Compositor',
    severity: 'high',
    primaryAutopsyId: 'mobile-scroll-jank-vram-explosion',
    primarySymptomSlug: 'mobile-scroll-stutter',
    detection_signals: [
      'will-change: transform or will-change: opacity applied permanently on card, row, or list-item selectors',
      'Combined with backdrop-filter: blur(...) or heavy box-shadows across dozens of DOM nodes',
    ],
    pattern_hints: ['will-change:', 'backdrop-filter:', 'content-visibility: auto'],
  },
  {
    id: 'css-zindex-trapped-in-stacking-context',
    title: 'High z-index inside transform/opacity/filter container instead of Top Layer',
    category: 'Rendering & CSS Compositor',
    severity: 'high',
    primaryAutopsyId: 'zindex-9999-tooltip-war',
    primarySymptomSlug: 'z-index-ignored',
    detection_signals: [
      'z-index >= 999 (e.g. z-index: 9999 or z-[9999]) on tooltips, dropdowns, or modals inside transformed/filtered/opacity<1 ancestors',
      'Legacy React portal + JS scroll-repositioning instead of native <dialog> or Popover Top Layer',
    ],
    pattern_hints: ['z-index: 999', 'z-[999', 'translateZ(0)', 'popover'],
  },
  {
    id: 'css-root-var-mutation-and-layout-thrashing',
    title: 'Global :root CSS variable mutation or interleaved DOM layout reads/writes',
    category: 'Rendering & CSS Compositor',
    severity: 'high',
    primaryAutopsyId: 'fourteen-rerenders-one-click',
    primarySymptomSlug: 'forced-layout-reflow',
    extraSymptomSlugs: ['inp-long-task-on-click'],
    detection_signals: [
      'document.documentElement.style.setProperty("--...", ...) mutating :root on interactive toggles',
      'Interleaved offsetHeight / getBoundingClientRect() reads and style writes inside loops or useLayoutEffect',
    ],
    pattern_hints: ['documentElement.style.setProperty', 'useLayoutEffect', 'offsetHeight', 'getBoundingClientRect'],
  },
  {
    id: 'css-100vh-mobile-viewport-clipping',
    title: 'Static 100vh height clipping fixed CTAs behind mobile browser toolbars',
    category: 'Rendering & CSS Compositor',
    severity: 'medium',
    primarySymptomSlug: 'mobile-100vh-cuts-off-toolbar',
    detection_signals: [
      'height: 100vh or min-height: 100vh (or Tailwind h-screen) on mobile full-bleed layouts with bottom actions',
      'Missing 100dvh / 100svh fallback for dynamic mobile toolbars',
    ],
    pattern_hints: ['100vh', 'h-screen', '100dvh', '100svh'],
    triggerOverride:
      'Sizing full-viewport mobile layouts or drawers with height: 100vh / min-height: 100vh',
    rootCauseOverride:
      'Classic 100vh maps to the large viewport height, extending underneath mobile Safari/Chrome dynamic address bars and clipping bottom CTAs',
    howToSpotOverride:
      'Audit CSS/Tailwind for 100vh or h-screen on app shells and drawers without 100dvh/100svh',
    fixOverride:
      'Replace 100vh with 100dvh (or 100svh for stable minimum height) with a progressive fallback',
  },
  {
    id: 'web-font-swap-cls-without-metrics',
    title: '@font-face without font-display or metric overrides causing text CLS',
    category: 'Rendering & CSS Compositor',
    severity: 'medium',
    primarySymptomSlug: 'cls-font-swap-layout-shift',
    detection_signals: [
      '@font-face rules omitting font-display or metric overrides (size-adjust, ascent-override, descent-override)',
      'Critical above-the-fold webfonts not preloaded with <link rel="preload" as="font">',
    ],
    pattern_hints: ['@font-face', 'font-display', 'size-adjust'],
    triggerOverride:
      'Declaring custom @font-face rules without font-display: swap/optional and fallback metric overrides',
    rootCauseOverride:
      'Late-discovered web fonts with mismatched glyph metrics resize line boxes when swapping in, causing measurable Cumulative Layout Shift (CLS > 0.1)',
    howToSpotOverride:
      'Inspect CSS @font-face declarations and DevTools Performance Layout Shift records attributed to text reflow',
    fixOverride:
      'Set font-display: swap (or optional), preload primary above-the-fold fonts, and configure size-adjust/ascent-override fallback descriptors',
  },

  // --- 4. React / State & Race Conditions ---
  {
    id: 'checkout-mutation-without-idempotency',
    title: 'Payment/checkout mutation without synchronous lock or Idempotency-Key',
    category: 'React / State & Race Conditions',
    severity: 'critical',
    primaryAutopsyId: 'double-payment-race-condition',
    primarySymptomSlug: 'double-payment-race-condition',
    detection_signals: [
      'POST to /checkout, /pay, /charge, or /order guarded only by React state disabled={isSubmitting}',
      'Missing synchronous useRef/state-machine transition lock and missing Idempotency-Key request header',
    ],
    pattern_hints: ['Idempotency-Key', 'isSubmitting', '/checkout', '/charge', '/pay'],
  },
  {
    id: 'useeffect-fetch-without-abort-or-stable-deps',
    title: 'useEffect with fetch without AbortController or with unstable object deps',
    category: 'React / State & Race Conditions',
    severity: 'critical',
    primaryAutopsyId: 'useeffect-dependency-loop-ddos',
    primarySymptomSlug: 'useeffect-infinite-loop-429',
    detection_signals: [
      'useEffect calling fetch(...) without creating an AbortController and returning () => controller.abort()',
      'Freshly allocated object or array literal passed in useEffect dependency array causing infinite re-fetches',
    ],
    pattern_hints: ['useEffect(', 'fetch(', 'AbortController', 'controller.abort()'],
  },
  {
    id: 'ssr-hydration-nondeterministic-branching',
    title: 'SSR hydration mismatch from render-time Date/locale or window branching',
    category: 'React / State & Race Conditions',
    severity: 'high',
    primaryAutopsyId: 'hydration-flicker-and-bailout',
    primarySymptomSlug: 'hydration-mismatch-input-wiped',
    detection_signals: [
      'Calling new Date().toLocaleTimeString(), Date.now(), or Math.random() directly in SSR component render body',
      'Branching initial JSX on typeof window !== "undefined" or window.location before hydration completes',
    ],
    pattern_hints: ['toLocaleTimeString', 'toLocaleDateString', 'typeof window', 'window.location'],
  },
  {
    id: 'uncleaned-observer-or-listener-memory-leak',
    title: 'Uncleaned MutationObserver/ResizeObserver/event listener retaining detached DOM',
    category: 'React / State & Race Conditions',
    severity: 'high',
    primaryAutopsyId: 'eight-hour-spa-memory-leak',
    primarySymptomSlug: 'spa-memory-leak-oom',
    detection_signals: [
      'new MutationObserver(...), new ResizeObserver(...), or window/document.addEventListener without cleanup',
      'Missing observer.disconnect() or AbortController signal in effect teardown across SPA route transitions',
    ],
    pattern_hints: ['new MutationObserver', 'new ResizeObserver', '.disconnect()', 'addEventListener('],
  },
  {
    id: 'stale-closure-in-interval-or-listener',
    title: 'setInterval or long-lived callback capturing stale React state with empty deps',
    category: 'React / State & Race Conditions',
    severity: 'medium',
    primarySymptomSlug: 'stale-closure-reads-old-state',
    detection_signals: [
      'setInterval(...) inside useEffect(..., []) referencing React state variables without functional updater or ref',
      'Long-lived event listener closing over render-time state without re-subscribing or reading latest ref',
    ],
    pattern_hints: ['setInterval(', 'useEffect(', '[]'],
    triggerOverride:
      'Registering setInterval or global listeners inside useEffect(..., []) that read React state directly',
    rootCauseOverride:
      'Closures capture the lexical environment of the initial render, reading outdated state bindings on every subsequent tick',
    howToSpotOverride:
      'Check useEffect callbacks with empty [] dependency arrays that read state variables inside setInterval/addEventListener',
    fixOverride:
      'Use functional state updaters (prev => ...), store mutable latest values in a ref, or include dependencies with proper teardown',
  },

  // --- 5. Security & A11y ---
  {
    id: 'third-party-script-and-innerhtml-xss',
    title: 'Unsanitized innerHTML sink, unvalidated postMessage, or first-party 3P script',
    category: 'Security & A11y',
    severity: 'critical',
    primaryAutopsyId: 'third-party-script-xss-takeover',
    primarySymptomSlug: 'third-party-xss-exfiltration',
    detection_signals: [
      'Direct assignment to element.innerHTML or React dangerouslySetInnerHTML without Trusted Types / sanitizer',
      "window.addEventListener('message', ...) without strict event.origin and runtime schema validation",
      'Un-sandboxed third-party <script> embedded directly inside authenticated app shell',
    ],
    pattern_hints: ['.innerHTML =', 'dangerouslySetInnerHTML', "addEventListener('message'", 'trustedTypes'],
  },
  {
    id: 'custom-div-modal-without-inert-or-dialog',
    title: 'Custom div modal overlay missing <dialog>.showModal() or inert background',
    category: 'Security & A11y',
    severity: 'high',
    primaryAutopsyId: 'zindex-9999-tooltip-war',
    primarySymptomSlug: 'modal-focus-escapes-behind-backdrop',
    extraConceptIds: [
      'native-dialog-element',
      'inert-attribute-focus',
      'browser-top-layer',
      'roving-tabindex-focus-order',
    ],
    detection_signals: [
      'role="dialog" or aria-modal="true" implemented on a <div> instead of native <dialog>',
      'No inert attribute applied to background landmarks and no showModal() Top Layer focus trapping',
    ],
    pattern_hints: ['role="dialog"', 'aria-modal="true"', '<dialog', 'inert'],
    triggerOverride:
      'Building modals with <div role="dialog" aria-modal="true"> instead of native <dialog>.showModal()',
    rootCauseOverride:
      'Custom div overlays do not enter the browser Top Layer or mark background subtrees inert, allowing keyboard Tab focus and screen readers to escape behind the backdrop',
    howToSpotOverride:
      'Press Tab repeatedly while the modal is open and check if document.activeElement moves into background page controls',
    fixOverride:
      'Use native <dialog> with showModal() (or apply the inert attribute to background siblings when open) so Top Layer and focus containment are enforced by the engine',
  },
  {
    id: 'catastrophic-regex-backtracking-redos',
    title: 'Nested-quantifier RegExp on user input risking main-thread ReDoS freeze',
    category: 'Security & A11y',
    severity: 'medium',
    primarySymptomSlug: 'regex-hangs-tab-on-input',
    detection_signals: [
      'Regular expressions with nested quantifiers like (.+)+, (a+)+, or (\\w+)* tested against unbounded user input',
      'Missing input length cap before running complex validation regexes on the main thread',
    ],
    pattern_hints: ['new RegExp(', '.test(', '(.+)+', '(\\w+)+'],
    triggerOverride:
      'Running regular expressions with nested quantifiers on unbounded user input in form validators or URL parsers',
    rootCauseOverride:
      'JavaScript NFA regex engines exhibit exponential backtracking on near-matching strings, locking up the main thread at 100% CPU',
    howToSpotOverride:
      'Audit regex literals and new RegExp() for nested quantifiers and profile with crafted near-match strings in DevTools Flame Chart',
    fixOverride:
      'Rewrite to linear-time patterns without nested quantifiers, cap input length before validation, or use native parsers like new URL()',
  },

  // --- 6. Testing Fidelity ---
  {
    id: 'jsdom-only-interaction-tests-and-passive-touch',
    title: 'JSDOM-only overlay/touch tests masking hit-testing and passive listener bugs',
    category: 'Testing Fidelity',
    severity: 'high',
    primaryAutopsyId: 'green-ci-broken-prod-jsdom',
    primarySymptomSlug: 'green-ci-broken-prod-dropdown',
    detection_signals: [
      'Non-passive touchstart/wheel listeners calling event.preventDefault() without { passive: false }',
      'Hidden backdrops using opacity: 0 without pointer-events: none or inert, tested only in JSDOM',
    ],
    pattern_hints: ['touchstart', 'preventDefault()', 'pointer-events: none', 'jsdom'],
  },
  {
    id: 'fragile-dom-selectors-instead-of-a11y-queries',
    title: 'Component/E2E tests relying on brittle DOM/CSS selectors instead of role queries',
    category: 'Testing Fidelity',
    severity: 'medium',
    primaryAutopsyId: 'green-ci-broken-prod-jsdom',
    extraConceptIds: [
      'a11y-tree-queries-vs-dom-selectors',
      'test-fidelity-spectrum',
      'simulated-dom-vs-real-engines',
    ],
    detection_signals: [
      'Tests querying container.querySelector(...) or document.querySelector(...) for interactive controls',
      'Missing getByRole / findByRole accessible-name assertions, hiding broken ARIA/inert states',
    ],
    pattern_hints: ['container.querySelector(', 'document.querySelector(', 'getByRole('],
    triggerOverride:
      'Asserting interactive flows via container.querySelector() and synthetic element.click() instead of accessible role queries',
    rootCauseOverride:
      'Raw DOM queries ignore the Accessibility Tree, visibility, inert subtrees, and hit-testing, producing green tests for unreachable controls',
    howToSpotOverride:
      'Search *.test.* and *.spec.* files for container.querySelector / data-testid on buttons and menus instead of getByRole',
    fixOverride:
      'Query interactive controls via getByRole with accessible names and verify critical overlay/navigation flows in a real browser engine (Playwright)',
  },

  // --- 7. Browser Lifecycle & Performance ---
  {
    id: 'unload-listener-blocks-bfcache',
    title: 'unload event listener disabling Back/Forward Cache (bfcache)',
    category: 'Browser Lifecycle & Performance',
    severity: 'high',
    primarySymptomSlug: 'back-button-reload',
    extraAutopsyIds: ['zombie-bundle-after-deploy'],
    extraConceptIds: ['bfcache-navigation', 'beacon-api-visibilitychange'],
    detection_signals: [
      "window.addEventListener('unload', ...) or window.onunload = ... attached anywhere in app or analytics bundle",
      'Missing migration to pagehide / visibilitychange + navigator.sendBeacon()',
    ],
    pattern_hints: ["addEventListener('unload'", 'window.onunload', 'pagehide', 'visibilitychange'],
    triggerOverride:
      "Attaching window.addEventListener('unload', ...) or window.onunload handlers for telemetry or cleanup",
    rootCauseOverride:
      'Unload handlers are unreliable on mobile and explicitly disqualify the document from Back/Forward Cache (bfcache) restoration across major engines',
    howToSpotOverride:
      "Search codebase for 'unload' listeners or inspect DevTools Application -> Back/forward cache NotRestoredReasons",
    fixOverride:
      "Replace unload listeners with pagehide and visibilitychange (document.visibilityState === 'hidden') paired with navigator.sendBeacon()",
  },
  {
    id: 'multi-tab-unshared-websocket-and-fixed-reconnect',
    title: 'Dedicated WebSocket per tab with fixed reconnect timer (thundering herd)',
    category: 'Browser Lifecycle & Performance',
    severity: 'high',
    primaryAutopsyId: 'multi-tab-websocket-thundering-herd',
    primarySymptomSlug: 'websocket-multi-tab-storm',
    detection_signals: [
      'new WebSocket(...) opened directly inside component/hook without cross-tab navigator.locks leader election',
      'Fixed setTimeout(..., 1000) reconnect loop without exponential full-jitter backoff',
    ],
    pattern_hints: ['new WebSocket(', 'navigator.locks', 'BroadcastChannel'],
  },
  {
    id: 'main-thread-large-dataset-sort-and-serialization',
    title: 'Heavy dataset sort or large JSON.stringify blocking the main thread',
    category: 'Browser Lifecycle & Performance',
    severity: 'high',
    primaryAutopsyId: 'zero-main-thread-ui-worker',
    primarySymptomSlug: 'large-grid-sort-blocks-ui',
    detection_signals: [
      'Synchronous .sort(...) or JSON.stringify(...) over large collections (>10k rows) directly on the UI thread',
      'Missing Dedicated Web Worker offloading with Transferable TypedArrays or OPFS persistence',
    ],
    pattern_hints: ['.sort(', 'JSON.stringify(', 'new Worker(', 'Transferable'],
  },
];

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export interface BuildAuditRulesCatalogOptions {
  concepts?: LoadedConcept[];
  autopsies?: LoadedAutopsy[];
  symptoms?: ProductionSymptomConfig[];
  generatedAt?: string;
  /**
   * 'throw' (default): a rule that references an absent autopsy, concept or symptom throws.
   * 'skip': such a rule is omitted from the catalog.
   */
  onMissingReference?: 'throw' | 'skip';
}

class MissingReferenceError extends Error {}

export function buildAuditRulesCatalog(
  options: BuildAuditRulesCatalogOptions = {}
): AuditRulesCatalog {
  const concepts = options.concepts ?? getAllConcepts();
  const autopsies = options.autopsies ?? getAllAutopsies();
  const symptoms = options.symptoms ?? PRODUCTION_SYMPTOMS;

  const conceptMap = new Map(concepts.map((c) => [c.frontmatter.id, c]));
  const autopsyMap = new Map(autopsies.map((a) => [a.frontmatter.id, a]));
  const symptomMap = new Map(symptoms.map((s) => [s.slug, s]));

  const buildRule = (bp: RuleBlueprint): AuditRule => {
    const primaryAutopsy = bp.primaryAutopsyId ? autopsyMap.get(bp.primaryAutopsyId) : undefined;
    if (bp.primaryAutopsyId && !primaryAutopsy) {
      throw new MissingReferenceError(`Audit rule "${bp.id}" references unknown autopsy "${bp.primaryAutopsyId}"`);
    }

    const primarySymptom = bp.primarySymptomSlug ? symptomMap.get(bp.primarySymptomSlug) : undefined;
    if (bp.primarySymptomSlug && !primarySymptom) {
      throw new MissingReferenceError(`Audit rule "${bp.id}" references unknown symptom "${bp.primarySymptomSlug}"`);
    }

    const autopsyIds = dedupe([
      ...(bp.primaryAutopsyId ? [bp.primaryAutopsyId] : []),
      ...(bp.extraAutopsyIds ?? []),
      ...(primarySymptom?.autopsy_ids ?? []),
    ]);

    for (const aid of autopsyIds) {
      if (!autopsyMap.has(aid)) {
        throw new MissingReferenceError(`Audit rule "${bp.id}" references unknown autopsy "${aid}"`);
      }
    }

    const conceptIds = dedupe([
      ...(primaryAutopsy?.frontmatter.traversed_concepts.map((tc) => tc.concept_id) ?? []),
      ...(primarySymptom?.concept_ids ?? []),
      ...(bp.extraConceptIds ?? []),
    ]);

    for (const cid of conceptIds) {
      if (!conceptMap.has(cid)) {
        throw new MissingReferenceError(`Audit rule "${bp.id}" references unknown concept "${cid}"`);
      }
    }

    const symptomSlugs = dedupe([
      ...(bp.primarySymptomSlug ? [bp.primarySymptomSlug] : []),
      ...(bp.extraSymptomSlugs ?? []),
    ]);

    for (const slug of symptomSlugs) {
      if (!symptomMap.has(slug)) {
        throw new MissingReferenceError(`Audit rule "${bp.id}" references unknown symptom "${slug}"`);
      }
    }

    const cf = primaryAutopsy?.frontmatter.case_file;
    const trigger = bp.triggerOverride ?? cf?.trigger ?? primarySymptom?.search_title ?? bp.title;
    const rootCause = bp.rootCauseOverride ?? cf?.root_cause ?? primarySymptom?.summary ?? bp.title;
    const howToSpot =
      bp.howToSpotOverride ?? cf?.how_to_spot ?? primarySymptom?.devtools_signature ?? bp.title;
    const fix = bp.fixOverride ?? cf?.fix ?? primarySymptom?.summary ?? bp.title;

    return {
      id: bp.id,
      title: bp.title,
      category: bp.category,
      severity: bp.severity,
      detection_signals: bp.detection_signals,
      pattern_hints: bp.pattern_hints,
      trigger,
      root_cause: rootCause,
      how_to_spot: howToSpot,
      fix,
      autopsy_ids: autopsyIds,
      concept_ids: conceptIds,
      symptom_slugs: symptomSlugs,
      canonical_urls: {
        autopsies: autopsyIds.map((id) => `${SITE_URL}/autopsies/${id}/`),
        concepts: conceptIds.map((id) => `${SITE_URL}/concepts/${id}/`),
        symptoms: symptomSlugs.map((slug) => `${SITE_URL}/symptoms/${slug}/`),
      },
    };
  };

  const skipMissing = options.onMissingReference === 'skip';
  const rules: AuditRule[] = [];
  for (const bp of RULE_BLUEPRINTS) {
    try {
      rules.push(buildRule(bp));
    } catch (err) {
      if (skipMissing && err instanceof MissingReferenceError) continue;
      throw err;
    }
  }

  const categories = AUDIT_CATEGORIES.filter((cat) => rules.some((r) => r.category === cat));

  const catalog: AuditRulesCatalog = {
    generated_at: options.generatedAt ?? new Date().toISOString(),
    version: AUDIT_CATALOG_VERSION,
    rule_count: rules.length,
    categories,
    rules,
  };

  return AuditRulesCatalogSchema.parse(catalog);
}

/**
 * Renders a deterministic, offline-ready Markdown reference catalog for the public
 * `frontend-rocks-audit` skill. Deliberately omits volatile timestamps so repeated builds
 * produce byte-identical output.
 */
export function renderAuditCatalogMarkdown(catalog: AuditRulesCatalog): string {
  const lines: string[] = [
    '# frontend.rocks Production Audit Catalog',
    '',
    `> Deterministic reference catalog (v${catalog.version}) — **${catalog.rule_count} concrete production audit rules** extracted from \`frontend.rocks\` Architecture Autopsies, Browser Internals concepts, and Production Symptoms.`,
    '',
    'Use this catalog offline during code audits. When network access is available, you can fetch the full mechanical breakdown of any linked concept or autopsy by appending `.md` to its slug (for example, `https://frontend.rocks/concepts/bfcache-navigation.md` or `https://frontend.rocks/autopsies/indexeddb-versionchange-deadlock.md`).',
    '',
    '## Categories',
    ...catalog.categories.map((category) => {
      const count = catalog.rules.filter((r) => r.category === category).length;
      const anchor = category
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      return `- [${category}](#${anchor}) (${count} rules)`;
    }),
    '',
  ];

  for (const category of catalog.categories) {
    const categoryRules = catalog.rules.filter((r) => r.category === category);
    lines.push(`## ${category}`, '');

    for (const rule of categoryRules) {
      lines.push(`### \`${rule.id}\` — ${rule.title}`);
      lines.push('');
      lines.push(`- **Severity:** \`${rule.severity.toUpperCase()}\``);
      lines.push(`- **Trigger:** ${rule.trigger}`);
      lines.push(`- **Root Cause:** ${rule.root_cause}`);
      lines.push(`- **How to Spot:** ${rule.how_to_spot}`);
      lines.push(`- **Fix:** ${rule.fix}`);
      lines.push('- **Detection Signals:**');
      for (const signal of rule.detection_signals) {
        lines.push(`  - ${signal}`);
      }
      lines.push(
        `- **Pattern Hints:** ${rule.pattern_hints.map((hint) => `\`${hint}\``).join(', ')}`
      );

      if (rule.canonical_urls.autopsies.length > 0) {
        lines.push(
          `- **Autopsies:** ${rule.canonical_urls.autopsies
            .map((url, idx) => `[${rule.autopsy_ids[idx]}](${url})`)
            .join(', ')}`
        );
      }

      if (rule.canonical_urls.concepts.length > 0) {
        lines.push(
          `- **Concepts:** ${rule.canonical_urls.concepts
            .map((url, idx) => `[${rule.concept_ids[idx]}](${url})`)
            .join(', ')}`
        );
      }

      if (rule.canonical_urls.symptoms.length > 0) {
        lines.push(
          `- **Symptoms:** ${rule.canonical_urls.symptoms
            .map((url, idx) => `[${rule.symptom_slugs[idx]}](${url})`)
            .join(', ')}`
        );
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

// --- Deterministic Source Matcher for Automated Verification & Offline Audits ---

export interface AuditFinding {
  ruleId: string;
  title: string;
  category: AuditCategory;
  severity: AuditSeverity;
  filePath: string;
  line: number;
  evidence: string;
  autopsyUrls: string[];
  conceptUrls: string[];
  symptomUrls: string[];
  fix: string;
}

interface RuleMatcher {
  ruleId: string;
  filePattern: RegExp;
  match: (source: string) => { line: number; evidence: string } | null;
}

function findLineNumber(source: string, index: number): number {
  if (index <= 0) return 1;
  return source.slice(0, index).split('\n').length;
}

function getLineAt(source: string, line: number): string {
  return (source.split('\n')[line - 1] ?? '').trim();
}

const JS_TS_FILES = /\.(?:[cm]?[jt]sx?)$/i;
const CSS_OR_UI_FILES = /\.(?:css|scss|less|[jt]sx)$/i;
const TEST_FILES = /\.(?:test|spec)\.[jt]sx?$/i;

const DETERMINISTIC_MATCHERS: readonly RuleMatcher[] = [
  {
    ruleId: 'idb-open-without-versionchange',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /indexedDB\.open\s*\(/.exec(source);
      if (!m) return null;
      const hasVersionChange =
        /onversionchange|addEventListener\s*\(\s*['"]versionchange['"]/.test(source);
      const hasPageHideClose = /pagehide/.test(source) && /\.close\s*\(/.test(source);
      if (hasVersionChange && hasPageHideClose) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'idb-lww-full-document-put-sync',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /addEventListener\s*\(\s*['"]online['"]/.exec(source);
      if (!m) return null;
      const hasPut = /method\s*:\s*['"]PUT['"]/i.test(source);
      const hasLockOrCrdt = /navigator\.locks|crdt|vectorClock|yjs|automerge/i.test(source);
      if (!hasPut || hasLockOrCrdt) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'idb-heavy-sync-in-upgradeneeded',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /onupgradeneeded\s*=/.exec(source);
      if (!m) return null;
      const after = source.slice(m.index, m.index + 800);
      if (!/\bfetch\s*\(/.test(after)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'sw-uncoordinated-skipwaiting-claim',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const skip = /\bskipWaiting\s*\(\s*\)/.exec(source);
      const claim = /\bclients\.claim\s*\(\s*\)/.exec(source);
      if (!skip || !claim) return null;
      const hasCoordination =
        /controllerchange|SKIP_WAITING|postMessage\s*\(\s*\{[^}]*version/i.test(source);
      if (hasCoordination) return null;
      const line = findLineNumber(source, skip.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'css-static-will-change-on-lists',
    filePattern: CSS_OR_UI_FILES,
    match: (source) => {
      const m = /will-change\s*:\s*(?:transform|opacity|contents|scroll-position)/i.exec(source);
      if (!m) return null;
      const isDynamicOnly = /:hover|:active|:focus/.test(
        source.slice(Math.max(0, m.index - 120), m.index)
      );
      if (isDynamicOnly) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'css-zindex-trapped-in-stacking-context',
    filePattern: CSS_OR_UI_FILES,
    match: (source) => {
      const zMatch = /z-index\s*:\s*(\d{4,})/.exec(source);
      if (!zMatch) return null;
      const hasStackingContext = /(?:transform\s*:|opacity\s*:\s*0?\.\d+|filter\s*:)/.test(source);
      const usesTopLayer = /popover|<dialog|showModal\s*\(/.test(source);
      if (!hasStackingContext || usesTopLayer) return null;
      const line = findLineNumber(source, zMatch.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'css-root-var-mutation-and-layout-thrashing',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /documentElement\.style\.setProperty\s*\(\s*['"]--/.exec(source);
      if (m) {
        const line = findLineNumber(source, m.index);
        return { line, evidence: getLineAt(source, line) };
      }
      const layoutEffect = /useLayoutEffect\s*\(/.exec(source);
      if (layoutEffect && /offsetHeight|getBoundingClientRect\s*\(/.test(source)) {
        const line = findLineNumber(source, layoutEffect.index);
        return { line, evidence: getLineAt(source, line) };
      }
      return null;
    },
  },
  {
    ruleId: 'css-100vh-mobile-viewport-clipping',
    filePattern: CSS_OR_UI_FILES,
    match: (source) => {
      const m = /(?:min-)?height\s*:\s*100vh\b/.exec(source);
      if (!m) return null;
      if (/100(?:d|s)vh/.test(source)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'checkout-mutation-without-idempotency',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /fetch\s*\(\s*[`'"][^`'"]*(?:checkout|charge|pay|order)[^`'"]*[`'"]/.exec(source);
      if (!m) return null;
      const isMutation = /method\s*:\s*['"]POST['"]/i.test(source);
      const hasIdempotency = /Idempotency-Key|idempotencyKey/i.test(source);
      if (!isMutation || hasIdempotency) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'useeffect-fetch-without-abort-or-stable-deps',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const effectMatch = /useEffect\s*\(/.exec(source);
      if (!effectMatch) return null;
      const slice = source.slice(effectMatch.index, effectMatch.index + 1200);
      if (!/\bfetch\s*\(/.test(slice)) return null;
      const hasAbort = /AbortController/.test(slice) && /\.abort\s*\(/.test(slice);
      if (hasAbort) return null;
      const line = findLineNumber(source, effectMatch.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'ssr-hydration-nondeterministic-branching',
    filePattern: /\.[jt]sx$/i,
    match: (source) => {
      const m = /new Date\s*\(\s*\)\.toLocale(?:Time|Date)?String\s*\(/.exec(source);
      if (!m) return null;
      const guarded = /useEffect\s*\(|suppressHydrationWarning/.test(source);
      if (guarded) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'uncleaned-observer-or-listener-memory-leak',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /new\s+(?:MutationObserver|ResizeObserver)\s*\(/.exec(source);
      if (!m) return null;
      if (/\.disconnect\s*\(/.test(source)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'third-party-script-and-innerhtml-xss',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /\.innerHTML\s*=/.exec(source);
      if (!m) return null;
      if (/trustedTypes|DOMPurify|createPolicy/i.test(source)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'custom-div-modal-without-inert-or-dialog',
    filePattern: /\.[jt]sx$/i,
    match: (source) => {
      const m = /<div[^>]*role=["']dialog["']/.exec(source);
      if (!m) return null;
      if (/<dialog|inert/.test(source)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'unload-listener-blocks-bfcache',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m =
        /addEventListener\s*\(\s*['"]unload['"]|\bwindow\.onunload\s*=/.exec(source);
      if (!m) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'multi-tab-unshared-websocket-and-fixed-reconnect',
    filePattern: JS_TS_FILES,
    match: (source) => {
      const m = /new\s+WebSocket\s*\(/.exec(source);
      if (!m) return null;
      const hasSharing = /navigator\.locks|BroadcastChannel|SharedWorker|new\s+Worker\s*\(/.test(
        source
      );
      if (hasSharing) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
  {
    ruleId: 'fragile-dom-selectors-instead-of-a11y-queries',
    filePattern: TEST_FILES,
    match: (source) => {
      const m = /(?:container|document)\.querySelector\s*\(/.exec(source);
      if (!m) return null;
      if (/getByRole|findByRole/.test(source)) return null;
      const line = findLineNumber(source, m.index);
      return { line, evidence: getLineAt(source, line) };
    },
  },
];

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

export function matchAuditRulesInSource(
  source: string,
  filePath: string,
  catalog: AuditRulesCatalog
): AuditFinding[] {
  const ruleMap = new Map(catalog.rules.map((r) => [r.id, r]));
  const findings: AuditFinding[] = [];

  for (const matcher of DETERMINISTIC_MATCHERS) {
    if (!matcher.filePattern.test(filePath)) continue;
    const rule = ruleMap.get(matcher.ruleId);
    if (!rule) continue;

    const hit = matcher.match(source);
    if (!hit) continue;

    findings.push({
      ruleId: rule.id,
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      filePath,
      line: hit.line,
      evidence: hit.evidence,
      autopsyUrls: rule.canonical_urls.autopsies,
      conceptUrls: rule.canonical_urls.concepts,
      symptomUrls: rule.canonical_urls.symptoms,
      fix: rule.fix,
    });
  }

  return findings.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.line - b.line;
  });
}

export function scanProjectFilesForAuditRules(
  files: ReadonlyArray<{ path: string; content: string }>,
  catalog: AuditRulesCatalog
): AuditFinding[] {
  const allFindings = files.flatMap((file) =>
    matchAuditRulesInSource(file.content, file.path, catalog)
  );

  return allFindings.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const pathDiff = a.filePath.localeCompare(b.filePath);
    if (pathDiff !== 0) return pathDiff;
    return a.line - b.line;
  });
}
