import type { InstrumentName } from './types';

declare global {
  var __frInstrumentsLoaded: Set<InstrumentName> | undefined;
}

/**
 * Records that an instrument chunk has been loaded in the current JS runtime.
 * Used by Playwright bundle-isolation tests to confirm no instrument is loaded
 * on pages without an Experiment.
 */
export function markInstrumentLoaded(name: InstrumentName): void {
  if (typeof globalThis === 'undefined') return;
  if (!globalThis.__frInstrumentsLoaded) {
    globalThis.__frInstrumentsLoaded = new Set<InstrumentName>();
  }
  globalThis.__frInstrumentsLoaded.add(name);
}
