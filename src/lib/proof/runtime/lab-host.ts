import type { RunVariant } from '../define-experiment';
import type { ExperimentBundle } from '../experiment-schema';
import type { ParamValues } from './compose';
import { buildExperimentDocument } from './document';
import { CHANNEL } from './protocol';

declare const __FR_LAB_ALLOWED_PARENTS__: string[] | undefined;

export interface LabRunRequest {
  channel: typeof CHANNEL;
  type: 'fr:lab-run';
  runId: string;
  bundle: ExperimentBundle;
  variant: RunVariant;
  params: ParamValues;
  mutated: boolean;
  awaitInput: boolean;
}

const VALID_VARIANTS = new Set<string>(['treatment', 'control', 'blank']);

export function acceptLabMessage(
  event: { origin: string; data: unknown; fromParent: boolean },
  allowed: string[],
  pathId: string
): LabRunRequest | null {
  if (!event.fromParent) return null;
  if (!allowed.includes(event.origin)) return null;
  if (!event.data || typeof event.data !== 'object') return null;

  const d = event.data as Record<string, unknown>;
  if (d.channel !== CHANNEL || d.type !== 'fr:lab-run') return null;
  if (typeof d.runId !== 'string' || d.runId.length === 0) return null;
  if (typeof d.variant !== 'string' || !VALID_VARIANTS.has(d.variant)) return null;
  if (typeof d.mutated !== 'boolean' || typeof d.awaitInput !== 'boolean') return null;
  if (!d.params || typeof d.params !== 'object' || Array.isArray(d.params)) return null;
  if (!d.bundle || typeof d.bundle !== 'object') return null;

  const bundle = d.bundle as Record<string, unknown>;
  if (typeof bundle.id !== 'string' || bundle.id !== pathId) return null;

  return {
    channel: CHANNEL,
    type: 'fr:lab-run',
    runId: d.runId,
    bundle: d.bundle as ExperimentBundle,
    variant: d.variant as RunVariant,
    params: d.params as ParamValues,
    mutated: d.mutated,
    awaitInput: d.awaitInput,
  };
}

function deleteIdbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, 1500);
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => {
        clearTimeout(timer);
        finish();
      };
      req.onerror = () => {
        clearTimeout(timer);
        finish();
      };
      req.onblocked = () => {
        clearTimeout(timer);
        finish();
      };
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

export async function resetStorage(): Promise<string[]> {
  const failed: string[] = [];

  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) await deleteIdbDatabase(db.name);
      }
    }
  } catch {
    failed.push('indexedDB');
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    failed.push('caches');
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    failed.push('serviceWorker');
  }

  try {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  } catch {
    failed.push('localStorage');
  }

  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  } catch {
    failed.push('sessionStorage');
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
      const dir = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle & {
        keys?: () => AsyncIterable<string>;
        entries?: () => AsyncIterable<[string, FileSystemHandle]>;
      };
      if (typeof dir.keys === 'function') {
        for await (const name of dir.keys()) {
          await dir.removeEntry(name, { recursive: true });
        }
      } else if (typeof dir.entries === 'function') {
        for await (const [name] of dir.entries()) {
          await dir.removeEntry(name, { recursive: true });
        }
      }
    }
  } catch {
    failed.push('opfs');
  }

  return failed;
}

function extractPathId(pathname: string): string {
  const m = pathname.match(/^\/x\/([a-z0-9-]+)\/host\.html$/);
  return m ? m[1] : '';
}

function replaceDocument(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

declare global {
  interface Window {
    __frLabRun?: (req: LabRunRequest) => Promise<void>;
  }
}

function bootLabHost(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const pathId = extractPathId(window.location.pathname);

  if (window.parent !== window) {
    const allowed: string[] =
      typeof __FR_LAB_ALLOWED_PARENTS__ !== 'undefined' && Array.isArray(__FR_LAB_ALLOWED_PARENTS__)
        ? __FR_LAB_ALLOWED_PARENTS__
        : [];
    let handled = false;
    window.addEventListener('message', (event: MessageEvent) => {
      if (handled) return;
      const req = acceptLabMessage(
        {
          origin: event.origin,
          data: event.data,
          fromParent: event.source === window.parent,
        },
        allowed,
        pathId
      );
      if (!req) return;
      handled = true;
      void resetStorage().then(() => {
        const html = buildExperimentDocument(req.bundle, req.variant, req.params, {
          runId: req.runId,
          standalone: false,
          mutated: req.mutated,
          awaitInput: req.awaitInput,
          parentOrigin: event.origin,
          vendorBaseUrl: window.location.origin,
          origins: { self: window.location.origin, cross: window.location.origin },
        });
        replaceDocument(html);
      });
    });
  } else {
    window.__frLabRun = async (req: LabRunRequest) => {
      await resetStorage();
      const html = buildExperimentDocument(req.bundle, req.variant, req.params ?? {}, {
        runId: req.runId,
        standalone: true,
        mutated: Boolean(req.mutated),
        awaitInput: Boolean(req.awaitInput),
        parentOrigin: null,
        vendorBaseUrl: window.location.origin,
        origins: { self: window.location.origin, cross: window.location.origin },
      });
      replaceDocument(html);
    };
  }
}

bootLabHost();
