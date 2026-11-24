---
name: frontend-rocks-audit
description: Audit frontend repositories against 24 real production failure patterns documented in frontend.rocks Architecture Autopsies and Browser Internals (IndexedDB deadlocks, Service Worker cache skew, GPU VRAM explosions, useEffect loops, hydration bailouts, XSS sinks, and JSDOM blind spots).
license: MIT
metadata:
  author: DavidBonnemaison
  homepage: https://frontend.rocks/agents/
  repository: https://github.com/DavidBonnemaison/frontend-rocks-skills
  catalog_version: "1.0.0"
---

# frontend-rocks-audit

Audit a frontend codebase for concrete browser-engine, state-machine, storage, caching, rendering, security, and testing-fidelity failure modes documented on [frontend.rocks](https://frontend.rocks/).

This skill ships with an offline reference catalog at [`references/audit-catalog.md`](./references/audit-catalog.md) so it works with zero network access. If network access is available, you may also fetch canonical Markdown twins (`https://frontend.rocks/concepts/<slug>.md`, `https://frontend.rocks/autopsies/<slug>.md`) or the structured rule feed (`https://frontend.rocks/audit-rules.json`) for deeper mechanical verification.

## Audit Procedure

Follow these 4 steps strictly in order. Never dump raw regex grep output to the user — every reported finding must be contextually verified to achieve zero false positives.

### Step 1: Detect Stack & Runtime Architecture

Inspect the repository root before scanning code:
- Read `package.json` to identify framework (React, Next.js, Vite, Remix, Vue, Svelte, vanilla), state/query libraries (TanStack Query, Redux, Zustand, XState), styling (CSS Modules, Tailwind, styled-components), and test runners (Vitest/Jest JSDOM vs Playwright/Cypress).
- Locate Service Worker files (`sw.js`, `service-worker.ts`, Workbox configs), IndexedDB/storage wrappers, HTTP header configs (`next.config.*`, `netlify.toml`, `vercel.json`, `headers`), and realtime/WebSocket clients.

### Step 2: Target Relevant Source Files

Scope your search to production source and test files only. Skip `node_modules/`, `dist/`, `.next/`, `out/`, `coverage/`, minified bundles, and lockfiles.

Group candidate files by the 7 catalog domains in `references/audit-catalog.md`:
1. **IndexedDB & Storage**: files calling `indexedDB.open`, `onupgradeneeded`, `IDBDatabase`, or offline sync `PUT` handlers.
2. **Service Workers & Caching**: Service Worker scripts (`skipWaiting`, `clients.claim`, `caches.match`) and HTTP `Cache-Control` configs.
3. **Rendering & CSS Compositor**: stylesheets and UI components using `will-change`, high `z-index`, `transform`/`opacity`/`filter`, `100vh`, `@font-face`, or `useLayoutEffect` geometric reads.
4. **React / State & Race Conditions**: checkout/payment mutations, `useEffect` with `fetch`, SSR components calling `Date`/`window`, `MutationObserver`/`ResizeObserver`, and `setInterval` hooks.
5. **Security & A11y**: `innerHTML` / `dangerouslySetInnerHTML`, `postMessage` listeners, third-party `<script>` tags, custom `<div role="dialog">` modals, and complex validation `RegExp`.
6. **Testing Fidelity**: `touchstart` / `preventDefault` handlers, hidden `opacity: 0` overlays, and test suites using `querySelector` or JSDOM-only interaction assertions.
7. **Browser Lifecycle & Performance**: `unload` / `onunload` listeners, `new WebSocket(...)` hooks, and main-thread `.sort()` / `JSON.stringify()` over large datasets.

### Step 3: Zero-False-Positive Contextual Analysis

Read `references/audit-catalog.md` and evaluate every candidate match against the **surrounding file and callers**:

- **Check for existing mitigations before flagging**:
  - `indexedDB.open()` is NOT a finding if the shared DB helper attaches `db.onversionchange = () => db.close()` AND closes handles on `pagehide`.
  - `self.skipWaiting()` + `clients.claim()` is NOT a finding if gated by an explicit `postMessage` / `controllerchange` version-coordination reload handshake.
  - `will-change` is NOT a finding if scoped strictly to an active hover/drag interaction on a single element rather than applied statically to every item in a list or grid.
  - `useEffect` + `fetch` is NOT a finding if it creates an `AbortController`, passes `signal`, cleans up via `controller.abort()`, and keys dependencies on stable primitives (or delegates to a query cache machine).
  - Payment/checkout `POST` is NOT a finding if guarded by a synchronous ref/state-machine lock AND sends an `Idempotency-Key` header (directly or via a verified API client wrapper).
- **Discard low-confidence guesses**: If you cannot point to a concrete `file:line` and explain the exact browser/runtime causal chain, omit it.
- **Optional online enrichment**: When citing a concept or autopsy, you can optionally read `https://frontend.rocks/concepts/<slug>.md` or `https://frontend.rocks/autopsies/<slug>.md` to verify nuanced browser preconditions.

### Step 4: Emit a Severity-Ranked Audit Report

Present findings sorted by severity: **CRITICAL** → **HIGH** → **MEDIUM**.

For each finding, include:
1. **Rule ID & Title** (from `references/audit-catalog.md`)
2. **Location**: exact `path/to/file.ext:line`
3. **Observed Trigger**: the specific code pattern found in the repository
4. **Mechanical Root Cause**: why this fails in real browsers/production
5. **Minimal Fix**: a concrete, copy-ready patch tailored to the repo's stack
6. **Canonical References**: exact `https://frontend.rocks/autopsies/<slug>/` and `https://frontend.rocks/concepts/<slug>/` URLs from `references/audit-catalog.md`

End with a concise summary table counting findings by severity and noting any audited categories that came back clean.
