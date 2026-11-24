# frontend.rocks Production Audit Catalog

> Deterministic reference catalog (v1.0.0) — **2 concrete production audit rules** extracted from `frontend.rocks` Architecture Autopsies, Browser Internals concepts, and Production Symptoms.

Use this catalog offline during code audits. When network access is available, you can fetch the full mechanical breakdown of any linked concept or autopsy by appending `.md` to its slug (for example, `https://frontend.rocks/concepts/bfcache-navigation.md` or `https://frontend.rocks/autopsies/indexeddb-versionchange-deadlock.md`).

## Categories
- [IndexedDB & Storage](#indexeddb-storage) (1 rules)
- [Rendering & CSS Compositor](#rendering-css-compositor) (1 rules)

## IndexedDB & Storage

### `fixture-blocked-open-without-handler` — Fixture rule: blocked open without a version handler

- **Severity:** `HIGH`
- **Trigger:** A synthetic upgrade runs while another tab still holds the old version.
- **Root Cause:** The old tab never releases its handle, so the new open request stays blocked.
- **How to Spot:** DevTools shows a pending request that never settles after an upgrade.
- **Fix:** Close the handle on onversionchange so the upgrade can proceed.
- **Detection Signals:**
  - Synthetic open call without a version change handler
- **Pattern Hints:** `fixtureOpen(`, `onblocked`
- **Autopsies:** [fixture-autopsy](https://frontend.rocks/autopsies/fixture-autopsy/)
- **Concepts:** [fixture-concept-a](https://frontend.rocks/concepts/fixture-concept-a/), [fixture-concept-b](https://frontend.rocks/concepts/fixture-concept-b/)

## Rendering & CSS Compositor

### `fixture-layer-trapped-in-context` — Fixture rule: layer value trapped in an isolated context

- **Severity:** `MEDIUM`
- **Trigger:** A synthetic parent creates an isolated context around the child.
- **Root Cause:** The child value only competes inside the isolated parent context.
- **How to Spot:** The computed value is high but the element paints underneath a sibling.
- **Fix:** Lift the child out of the isolated parent or isolate the sibling.
- **Detection Signals:**
  - Synthetic layer value ignored inside an isolated parent
- **Pattern Hints:** `fixture-layer`, `isolated`
- **Concepts:** [fixture-concept-c](https://frontend.rocks/concepts/fixture-concept-c/)
- **Symptoms:** [fixture-symptom](https://frontend.rocks/symptoms/fixture-symptom/)
