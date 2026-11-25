import type { ConsoleEntry, RunVariant } from '../define-experiment';
import type { ExperimentBundle } from '../experiment-schema';
import { mountExperimentFrame, type MountedFrame } from './mount';
import type { RunResult } from './protocol';

export interface HarnessRequest {
  bundle: ExperimentBundle;
  variant: RunVariant;
  params?: Record<string, number | boolean | string>;
  mutated?: boolean;
  timeoutMs?: number;
  /** True when the runner will replay trusted input steps for this variant. */
  awaitInput?: boolean;
}

declare global {
  interface Window {
    __frHarness: { run(req: HarnessRequest): Promise<RunResult>; inputDone(runId: string): void };
    /** runId of the execution currently awaiting input, or null. Polled by the runner via page.waitForFunction. */
    __frHarnessWaiting: string | null;
    __frEngineConsole?: () => Promise<ConsoleEntry[]>;
  }
}

const stage = (): HTMLElement => {
  const el = document.getElementById('stage');
  if (!el) throw new Error('harness: #stage missing');
  return el;
};

const waiters = new Map<string, () => void>();
window.__frHarnessWaiting = null;

window.__frHarness = {
  inputDone(runId) {
    const resolve = waiters.get(runId);
    waiters.delete(runId);
    window.__frHarnessWaiting = null;
    resolve?.();
  },
  async run(req) {
    let frame: MountedFrame;
    try {
      // The harness only mounts host 'opaque' Experiments; host 'origin' uses the lab executor.
      frame = await mountExperimentFrame(stage(), {
        bundle: req.bundle,
        variant: req.variant,
        params: req.params,
        mutated: req.mutated,
        awaitInput: req.awaitInput ?? false,
        vendorBaseUrl: window.location.origin, // the harness serves /vendor/react.js
      });
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), trace: [], console: [] };
    }
    try {
      let injected: ConsoleEntry[] | undefined;
      if (req.bundle.consoleSource === 'engine' && window.__frEngineConsole) {
        await new Promise((r) => setTimeout(r, 250)); // allow engine to emit its warnings
        injected = await window.__frEngineConsole();
      }
      return await frame.observe({
        injectedConsole: injected,
        timeoutMs: req.timeoutMs,
        onAwaitingInput: ({ runId }) =>
          new Promise<void>((resolve) => {
            waiters.set(runId, resolve);
            window.__frHarnessWaiting = runId;
          }),
      });
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), trace: [], console: [] };
    } finally {
      frame.destroy();
    }
  },
};
