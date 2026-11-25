import type { ConsoleEntry, Json } from '../define-experiment';

export const RUNTIME_VERSION = '1';
export const CHANNEL = 'fr-proof';
export const LOAD_TIMEOUT_MS = 10_000;
export const OBSERVE_TIMEOUT_MS = 10_000;
/** Maximum JSON string length accepted for `present` (beyond this, presented is set to null). */
export const PRESENT_MAX_CHARS = 20_000;

export type RunResult =
  | { ok: true; value: Json; presented: Json | null; trace: Json[]; console: ConsoleEntry[] }
  | { ok: false; error: string; trace: Json[]; console: ConsoleEntry[] };

export interface FrameConfig {
  channel: typeof CHANNEL;
  runId: string;
  kind: string;
  params: Record<string, number | boolean | string>;
  origins: { self: string; cross: string };
  network: { mode: 'shim' | 'server'; routes: unknown[] } | null;
  standalone: boolean;
  /** Origin of the parent page, or null in standalone mode (test server / top-level lab host). */
  parentOrigin: string | null;
  /** True when the variant defines trusted input steps that the caller will replay. */
  awaitInput: boolean;
}

export type ParentToFrame =
  | { channel: typeof CHANNEL; runId: string; type: 'fr:observe'; injectedConsole?: ConsoleEntry[] }
  | { channel: typeof CHANNEL; runId: string; type: 'fr:input-done' };

export type FrameToParent =
  | { channel: typeof CHANNEL; runId: string; type: 'fr:loaded' }
  | { channel: typeof CHANNEL; runId: string; type: 'fr:awaiting-input' }
  | { channel: typeof CHANNEL; runId: string; type: 'fr:result'; result: RunResult };
