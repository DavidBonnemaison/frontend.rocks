import type { ConsoleEntry, RunVariant } from '../define-experiment';
import type { ExperimentBundle } from '../experiment-schema';
import { buildExperimentDocument } from './document';
import {
  CHANNEL,
  LOAD_TIMEOUT_MS,
  OBSERVE_TIMEOUT_MS,
  type FrameToParent,
  type RunResult,
} from './protocol';
import type { ParamValues } from './compose';

export interface MountRequest {
  bundle: ExperimentBundle;
  variant: RunVariant;
  params?: ParamValues;
  mutated?: boolean;
  /** True only when the caller replays trusted variant input steps. */
  awaitInput?: boolean;
  /** Defaults to `${window.location.origin}/experiments`. */
  vendorBaseUrl?: string;
  nonce?: string;
}

export interface ObserveOptions {
  injectedConsole?: ConsoleEntry[];
  timeoutMs?: number;
  /** Invoked when the iframe posts `fr:awaiting-input`. When omitted, `fr:input-done` is sent immediately. */
  onAwaitingInput?: (info: { runId: string; iframe: HTMLIFrameElement }) => Promise<void>;
}

export interface MountedFrame {
  iframe: HTMLIFrameElement;
  runId: string;
  observe(options?: ObserveOptions): Promise<RunResult>;
  destroy(): void;
}

function newRunId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function mountExperimentFrame(host: HTMLElement, req: MountRequest): Promise<MountedFrame> {
  if (req.bundle.host === 'origin') {
    return Promise.reject(new Error('FR_HOST_ORIGIN: use mountLabFrame for host "origin" experiments'));
  }
  const runId = newRunId();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('title', `${req.bundle.title} (${req.variant})`);
  iframe.setAttribute('data-experiment-id', req.bundle.id);
  iframe.setAttribute('data-variant', req.variant);
  iframe.setAttribute('data-run-id', runId);
  iframe.width = String(req.bundle.viewport.width);
  iframe.height = String(req.bundle.viewport.height);
  iframe.style.border = '0';
  iframe.style.display = 'block';

  const listeners = new Set<(msg: FrameToParent) => void>();
  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data as FrameToParent;
    if (!msg || msg.channel !== CHANNEL || msg.runId !== runId) return;
    for (const l of [...listeners]) l(msg);
  };
  window.addEventListener('message', onMessage);

  const waitFor = <T extends FrameToParent['type']>(type: T, timeoutMs: number) =>
    new Promise<Extract<FrameToParent, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(handler);
        reject(new Error(`FR_TIMEOUT waiting for ${type}`));
      }, timeoutMs);
      const handler = (msg: FrameToParent) => {
        if (msg.type !== type) return;
        clearTimeout(timer);
        listeners.delete(handler);
        resolve(msg as Extract<FrameToParent, { type: T }>);
      };
      listeners.add(handler);
    });

  const destroy = () => {
    window.removeEventListener('message', onMessage);
    listeners.clear();
    iframe.remove();
  };

  const post = (msg: Record<string, unknown>) =>
    // Opaque srcdoc origin cannot be addressed by name; messages carry no secrets.
    iframe.contentWindow?.postMessage({ channel: CHANNEL, runId, ...msg }, '*');

  // Register listener BEFORE attaching iframe so `fr:loaded` is never missed.
  const loaded = waitFor('fr:loaded', LOAD_TIMEOUT_MS);
  iframe.srcdoc = buildExperimentDocument(req.bundle, req.variant, req.params ?? {}, {
    runId,
    mutated: req.mutated,
    parentOrigin: window.location.origin,
    awaitInput: req.awaitInput ?? false,
    vendorBaseUrl: req.vendorBaseUrl ?? `${window.location.origin}/experiments`,
    nonce: req.nonce,
  });
  host.appendChild(iframe);

  return loaded.then(
    () => ({
      iframe,
      runId,
      destroy,
      observe: async (options: ObserveOptions = {}) => {
        const pending = waitFor('fr:result', options.timeoutMs ?? OBSERVE_TIMEOUT_MS);
        const onInput = (msg: FrameToParent) => {
          if (msg.type !== 'fr:awaiting-input') return;
          listeners.delete(onInput);
          Promise.resolve(options.onAwaitingInput?.({ runId, iframe }))
            .catch(() => undefined)
            .then(() => post({ type: 'fr:input-done' }));
        };
        listeners.add(onInput);
        post({ type: 'fr:observe', injectedConsole: options.injectedConsole });
        try {
          return (await pending).result;
        } finally {
          listeners.delete(onInput);
        }
      },
    }),
    (err) => {
      destroy();
      throw err;
    }
  );
}
