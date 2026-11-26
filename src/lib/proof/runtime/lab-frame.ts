import { LAB_ORIGIN } from './lab-origin';
import type { MountedFrame, MountRequest, ObserveOptions } from './mount';
import {
  CHANNEL,
  LOAD_TIMEOUT_MS,
  OBSERVE_TIMEOUT_MS,
  type FrameToParent,
} from './protocol';

function newRunId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function mountLabFrame(
  host: HTMLElement,
  req: MountRequest & { labOrigin?: string }
): Promise<MountedFrame> {
  const labOrigin = (req.labOrigin ?? LAB_ORIGIN).replace(/\/$/, '');
  const runId = newRunId();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
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
    if (event.origin !== labOrigin) return;
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
    iframe.contentWindow?.postMessage({ channel: CHANNEL, runId, ...msg }, labOrigin);

  const loaded = waitFor('fr:loaded', LOAD_TIMEOUT_MS);

  iframe.addEventListener(
    'load',
    () => {
      post({
        type: 'fr:lab-run',
        bundle: req.bundle,
        variant: req.variant,
        params: req.params ?? {},
        mutated: req.mutated ?? false,
        awaitInput: req.awaitInput ?? false,
      });
    },
    { once: true }
  );

  iframe.src = `${labOrigin}/x/${req.bundle.id}/host.html`;
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
