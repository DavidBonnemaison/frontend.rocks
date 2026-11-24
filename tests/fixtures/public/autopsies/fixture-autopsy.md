# Fixture Autopsy: a blocked open that never resolves

- **Canonical URL:** https://frontend.rocks/autopsies/fixture-autopsy/
- **Case:** #01
- **Failure Mode:** Cascading Latency
- **Production Symptom:** A synthetic request hangs forever when a second tab keeps the old version open.
- **Last Verified:** 2026-01-01

## Case File
- **Trigger:** A synthetic upgrade runs while another tab still holds the old version.
- **Symptom:** The synthetic open request stays pending and the UI never renders.
- **Root cause:** The old tab never releases its handle, so the new open request stays blocked.
- **Bad fix #1 (Retry in a loop):** Adds more pending requests behind the blocked one.
- **Bad fix #2 (Reload the page):** Hides the symptom until the next upgrade.
- **Fix:** Close the handle on onversionchange so the upgrade can proceed.
- **How to spot it:** DevTools shows a pending request that never settles after an upgrade.

## Causal Chain
1. [Fixture Concept A](https://frontend.rocks/concepts/fixture-concept-a.md): Fixture concept A is the first step of the synthetic causal chain.
2. [Fixture Concept B](https://frontend.rocks/concepts/fixture-concept-b.md): Fixture concept B is the second step of the synthetic causal chain.

## Primary Sources
- https://developer.mozilla.org/en-US/

---
## The Incident

A fixture incident.
