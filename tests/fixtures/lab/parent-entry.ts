import type { RunVariant } from '../../../src/lib/proof/define-experiment';
import type { ExperimentBundle } from '../../../src/lib/proof/experiment-schema';
import type { ParamValues } from '../../../src/lib/proof/runtime/compose';
import { mountForBundle } from '../../../src/lib/proof/runtime/mount-any';
import type { RunResult } from '../../../src/lib/proof/runtime/protocol';

interface TestRunOptions {
  labOrigin?: string;
  vendorBaseUrl?: string;
  awaitInput?: boolean;
  mutated?: boolean;
  timeoutMs?: number;
}

declare global {
  interface Window {
    __frWaiting?: boolean;
    __frGo?: boolean;
    __frTestRun: (
      id: string,
      variant: RunVariant,
      params?: ParamValues,
      opts?: TestRunOptions
    ) => Promise<RunResult>;
  }
}

function waitForGo(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (window.__frGo) {
        resolve();
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

window.__frTestRun = async (id, variant, params = {}, opts = {}) => {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('test parent: #stage missing');

  const res = await fetch(`/__bundles/${id}.json`);
  if (!res.ok) {
    return { ok: false, error: `FR_BUNDLE_FETCH_${res.status}`, trace: [], console: [] };
  }
  const bundle = (await res.json()) as ExperimentBundle;

  let frame;
  try {
    frame = await mountForBundle(stage, {
      bundle,
      variant,
      params,
      mutated: opts.mutated ?? false,
      awaitInput: opts.awaitInput ?? false,
      labOrigin: opts.labOrigin ?? 'http://127.0.0.1:4174',
      vendorBaseUrl: opts.vendorBaseUrl ?? window.location.origin,
    });
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), trace: [], console: [] };
  }

  try {
    return await frame.observe({
      timeoutMs: opts.timeoutMs,
      onAwaitingInput: opts.awaitInput
        ? async () => {
            window.__frWaiting = true;
            await waitForGo();
          }
        : undefined,
    });
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err), trace: [], console: [] };
  } finally {
    frame.destroy();
  }
};
