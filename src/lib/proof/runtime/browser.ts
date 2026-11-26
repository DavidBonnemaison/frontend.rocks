import type { ExperimentBundle } from '../experiment-schema';
import { evaluateCase, type CaseEvaluation } from './evaluate';
import type { MountedFrame } from './mount';
import { mountForBundle } from './mount-any';
import type { RunResult } from './protocol';

export type BrowserRunStatus = 'ran' | 'not-runnable' | 'blocked';
export type NotRunnableReason =
  | 'measured'
  | 'input'
  | 'emulation'
  | 'network-server'
  | 'engine-console'
  | 'host-origin';

export interface BrowserRunReport {
  status: BrowserRunStatus;
  reason: NotRunnableReason | 'storage-blocked' | null;
  cases: Record<string, CaseEvaluation>;
}

export function notRunnableReason(b: ExperimentBundle): NotRunnableReason | null {
  if (b.kind === 'measured') return 'measured';
  if (b.variants.treatment.input?.length || b.variants.control.input?.length) return 'input';
  if (Object.values(b.expect).some((c) => c.emulation && Object.keys(c.emulation).length > 0)) {
    return 'emulation';
  }
  if (b.network?.mode === 'server') return 'network-server';
  if (b.consoleSource === 'engine') return 'engine-console';
  return null;
}

/**
 * Runs every expect case of an Experiment inside the reader's browser.
 * `host` must be visible and inside the viewport during execution so rAF is not throttled.
 */
export async function runExperimentInBrowser(
  bundle: ExperimentBundle,
  opts: { host: HTMLElement; signal?: AbortSignal; vendorBaseUrl?: string; labOrigin?: string }
): Promise<BrowserRunReport> {
  const reason = notRunnableReason(bundle);
  if (reason) return { status: 'not-runnable', reason, cases: {} };

  const exec = async (
    variant: 'treatment' | 'control' | 'blank',
    params: Record<string, number | boolean | string>,
    mutated: boolean
  ): Promise<RunResult> => {
    if (opts.signal?.aborted) return { ok: false, error: 'FR_ABORTED', trace: [], console: [] };
    let frame: MountedFrame | undefined;
    try {
      frame = await mountForBundle(opts.host, {
        bundle,
        variant,
        params,
        mutated,
        vendorBaseUrl: opts.vendorBaseUrl,
        labOrigin: opts.labOrigin,
      });
      return await frame.observe();
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err), trace: [], console: [] };
    } finally {
      frame?.destroy();
    }
  };

  const cases: Record<string, CaseEvaluation> = {};
  for (const key of Object.keys(bundle.expect).sort()) {
    const { raw, ...evaluation } = await evaluateCase(bundle, key, exec);
    cases[key] = evaluation;
    const blocked = [raw.treatment, raw.control].some(
      (r) => !r.ok && /SecurityError|NotAllowedError/.test(r.error)
    );
    if (blocked) return { status: 'blocked', reason: 'storage-blocked', cases };
  }
  return { status: 'ran', reason: null, cases };
}
