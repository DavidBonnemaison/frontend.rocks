import type { EngineId } from './claim-schema';

export const ENGINE_LABELS: Record<EngineId, string> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
};

export const ENGINE_ORDER: readonly EngineId[] = ['chromium', 'firefox', 'webkit'] as const;

export function engineLabel(id: EngineId, version?: string | null): string {
  const base = ENGINE_LABELS[id];
  return version ? `${base} ${version}` : base;
}
