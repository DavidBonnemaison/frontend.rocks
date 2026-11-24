# frontend-rocks-audit

Production frontend audit skill for AI coding agents (Antigravity, Claude Code, Cursor, Codex, and any Agent Skills–compatible client), powered by the [frontend.rocks](https://frontend.rocks/) Architecture Autopsies and Browser Internals knowledge graph.

## Install in One Command

```bash
npx skills add DavidBonnemaison/frontend-rocks-skills --skill frontend-rocks-audit
```

### Manual Installation

```bash
git clone https://github.com/DavidBonnemaison/frontend-rocks-skills.git
```

Then copy `skills/frontend-rocks-audit/` into your agent's skills directory (for example `~/.claude/skills/frontend-rocks-audit/`).

## Example Prompts

- *"Audit this frontend repository with `frontend-rocks-audit` and rank production risks by severity."*
- *"Run `frontend-rocks-audit` on our Service Worker, IndexedDB, and offline sync code."*
- *"Check our React data fetching and checkout flows against `frontend-rocks-audit`."*
- *"Audit our CSS compositor usage, modals, and Playwright/Vitest test fidelity using `frontend-rocks-audit`."*

## What It Catches (24 Production Rules)

- **IndexedDB & Storage**: `indexedDB.open()` without `onversionchange` / `pagehide` close, LWW offline `PUT` overwrites, async work inside `onupgradeneeded`.
- **Service Workers & Caching**: Uncoordinated `skipWaiting()` + `clients.claim()`, stale HTML shells referencing pruned chunks, `Cache-Control: no-store` breaking bfcache.
- **Rendering & CSS Compositor**: Static `will-change` VRAM explosions on card grids, `z-index` trapped in stacking contexts, `:root` CSS var & `useLayoutEffect` layout thrashing, mobile `100vh` clipping, web-font swap CLS.
- **React / State & Race Conditions**: Double-payment mutations without synchronous locks or `Idempotency-Key`, `useEffect` fetch loops without `AbortController`, SSR hydration mismatches wiping user inputs, uncleaned `MutationObserver` memory leaks, stale interval closures.
- **Security & A11y**: Unsanitized `innerHTML` / unvalidated `postMessage` / first-party 3P scripts, custom `<div>` modals leaking keyboard focus instead of `<dialog>` / `inert`, catastrophic ReDoS regexes.
- **Testing Fidelity**: JSDOM-only overlay/touch tests masking hit-testing and passive listener failures, brittle `querySelector` assertions instead of `getByRole`.
- **Browser Lifecycle & Performance**: `unload` listeners disabling bfcache, multi-tab unshared WebSockets with fixed reconnect timers, main-thread large dataset sorts.

## Works Offline & Online

- **Offline-first**: Bundles [`references/audit-catalog.md`](./references/audit-catalog.md) directly inside the skill.
- **Online deep-dives**: Links directly to canonical `https://frontend.rocks/autopsies/<slug>/` and `https://frontend.rocks/concepts/<slug>/` pages (with `.md` Markdown twins and `https://frontend.rocks/audit-rules.json`).

## More Agent Integrations

Explore the MCP server (`@frontend-rocks/mcp`), `llms.txt`, `graph.json`, and `Accept: text/markdown` content negotiation at **[https://frontend.rocks/agents/](https://frontend.rocks/agents/)**.

## License

MIT — see [LICENSE](./LICENSE).
