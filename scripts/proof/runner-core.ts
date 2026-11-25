import type { Browser, BrowserContext, ConsoleMessage, FrameLocator, Page } from '@playwright/test';
import type { EngineId } from '../../src/lib/proof/claim-schema';
import type {
  ConsoleEntry,
  Emulation,
  InputStep,
  RunVariant,
} from '../../src/lib/proof/define-experiment';
import type { ExperimentBundle } from '../../src/lib/proof/experiment-schema';
import type { CaseResult, MeasuredObserved, VacuityResult } from '../../src/lib/proof/results-schema';
import { mannWhitneyGreater, median } from '../../src/lib/proof/stats';
import type { ParamValues } from '../../src/lib/proof/runtime/compose';
import { jsonEqual } from '../../src/lib/proof/runtime/canonical-json';
import { evaluateCase, type Executor } from '../../src/lib/proof/runtime/evaluate';
import type { RunResult } from '../../src/lib/proof/runtime/protocol';
import { encodeParams, type TestServer } from './test-server';

export interface EngineRunInput {
  browser: Browser;
  engine: EngineId;
  bundle: ExperimentBundle;
  harnessOrigin: string;
  labOrigin: string | null;
  testServer: TestServer | null;
  timeoutMs: number;
  headed?: boolean;
}

export interface EngineRunOutcome {
  cases: Record<string, CaseResult>;
  vacuity: VacuityResult;
}

const CONSOLE_LEVEL_MAP: Record<string, ConsoleEntry['level']> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`FR_TIMEOUT: ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function stableEmulationKey(emulation: Emulation | undefined): string {
  if (!emulation || Object.keys(emulation).length === 0) return '{}';
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(emulation).sort()) {
    const val = emulation[k as keyof Emulation];
    if (val !== undefined) sorted[k] = val;
  }
  return JSON.stringify(sorted);
}

function buildContextOptions(
  viewport: { width: number; height: number },
  emulation: Emulation | undefined
): Parameters<Browser['newContext']>[0] {
  const opts: Parameters<Browser['newContext']>[0] = { viewport };
  if (!emulation) return opts;
  if (emulation.deviceScaleFactor !== undefined) opts.deviceScaleFactor = emulation.deviceScaleFactor;
  if (emulation.colorScheme !== undefined) opts.colorScheme = emulation.colorScheme;
  if (emulation.reducedMotion !== undefined) opts.reducedMotion = emulation.reducedMotion;
  if (emulation.forcedColors !== undefined) opts.forcedColors = emulation.forcedColors;
  if (emulation.hasTouch !== undefined) opts.hasTouch = emulation.hasTouch;
  return opts;
}

async function verifyEmulation(
  context: BrowserContext,
  emulation: Emulation | undefined
): Promise<string | null> {
  if (!emulation || Object.keys(emulation).length === 0) return null;
  const probe = await context.newPage();
  try {
    const applied = await probe.evaluate((e: Emulation) => ({
      colorScheme: e.colorScheme ? matchMedia(`(prefers-color-scheme: ${e.colorScheme})`).matches : true,
      reducedMotion: e.reducedMotion
        ? matchMedia(`(prefers-reduced-motion: ${e.reducedMotion})`).matches
        : true,
      forcedColors: e.forcedColors ? matchMedia(`(forced-colors: ${e.forcedColors})`).matches : true,
      deviceScaleFactor: e.deviceScaleFactor ? window.devicePixelRatio === e.deviceScaleFactor : true,
      hasTouch: e.hasTouch === undefined ? true : (navigator.maxTouchPoints > 0) === e.hasTouch,
    }), emulation);
    const failed = Object.entries(applied)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    return failed.length > 0 ? `emulation not applied: ${failed.join(', ')}` : null;
  } finally {
    await probe.close();
  }
}

async function replayInputSteps(
  page: Page,
  target: Page | FrameLocator,
  box: { x: number; y: number },
  steps: InputStep[]
): Promise<void> {
  for (const step of steps) {
    switch (step.action) {
      case 'click':
        await target.locator(step.selector).click({
          button: step.button,
          clickCount: step.clickCount,
        });
        break;
      case 'tap':
        await target.locator(step.selector).tap();
        break;
      case 'press':
        await page.keyboard.press(step.key);
        break;
      case 'type':
        await target.locator(step.selector).pressSequentially(step.text);
        break;
      case 'move':
        await page.mouse.move(box.x + step.from[0], box.y + step.from[1]);
        await page.mouse.move(box.x + step.to[0], box.y + step.to[1], { steps: step.steps });
        break;
      case 'wheel':
        await page.mouse.wheel(step.deltaX, step.deltaY);
        break;
      case 'wait':
        await page.waitForTimeout(step.ms);
        break;
    }
  }
}

interface HarnessContextEntry {
  context: BrowserContext;
  page: Page;
  engineConsole: ConsoleEntry[];
  emulationError: string | null;
}

interface PageContextEntry {
  context: BrowserContext;
  emulationError: string | null;
}

class ContextPool {
  private readonly input: EngineRunInput;
  private readonly harnessContexts = new Map<string, HarnessContextEntry>();
  private readonly serverContexts = new Map<string, PageContextEntry>();
  private readonly labContexts = new Map<string, PageContextEntry>();
  private readonly allowedOrigins: Set<string>;
  private labRunSeq = 0;

  constructor(input: EngineRunInput) {
    this.input = input;
    this.allowedOrigins = new Set(
      [
        input.harnessOrigin,
        input.labOrigin,
        input.testServer?.selfOrigin,
        input.testServer?.crossOrigin,
      ].filter(Boolean) as string[]
    );
  }

  private async installNetworkBlock(context: BrowserContext): Promise<void> {
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (
        this.allowedOrigins.has(url.origin) ||
        url.protocol === 'data:' ||
        url.protocol === 'about:' ||
        url.protocol === 'blob:'
      ) {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
  }

  private async getHarnessContext(
    emulationKey: string,
    emulation: Emulation | undefined
  ): Promise<HarnessContextEntry> {
    const existing = this.harnessContexts.get(emulationKey);
    if (existing) return existing;

    const { browser, bundle, harnessOrigin } = this.input;
    const viewport = {
      width: Math.max(1960, bundle.viewport.width + 40),
      height: Math.max(1240, bundle.viewport.height + 40),
    };
    const context = await browser.newContext(buildContextOptions(viewport, emulation));
    await this.installNetworkBlock(context);
    const emulationError = await verifyEmulation(context, emulation);

    const page = await context.newPage();
    const engineConsole: ConsoleEntry[] = [];
    if (bundle.consoleSource === 'engine') {
      page.on('console', (msg: ConsoleMessage) => {
        const level = CONSOLE_LEVEL_MAP[msg.type()];
        if (level) engineConsole.push({ level, text: msg.text() });
      });
      await page.exposeFunction('__frEngineConsole', () => engineConsole.splice(0));
    }

    if (!emulationError) {
      await page.goto(`${harnessOrigin}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => typeof (window as unknown as { __frHarness?: unknown }).__frHarness === 'object'
      );
    }

    const entry: HarnessContextEntry = { context, page, engineConsole, emulationError };
    this.harnessContexts.set(emulationKey, entry);
    return entry;
  }

  private async getServerContext(
    emulationKey: string,
    emulation: Emulation | undefined
  ): Promise<PageContextEntry> {
    const existing = this.serverContexts.get(emulationKey);
    if (existing) return existing;

    const { browser, bundle } = this.input;
    const context = await browser.newContext(buildContextOptions({ ...bundle.viewport }, emulation));
    await this.installNetworkBlock(context);
    const emulationError = await verifyEmulation(context, emulation);
    const entry: PageContextEntry = { context, emulationError };
    this.serverContexts.set(emulationKey, entry);
    return entry;
  }

  private async getLabContext(
    emulationKey: string,
    emulation: Emulation | undefined
  ): Promise<PageContextEntry> {
    const existing = this.labContexts.get(emulationKey);
    if (existing) return existing;

    const { browser, bundle } = this.input;
    const context = await browser.newContext(buildContextOptions({ ...bundle.viewport }, emulation));
    await this.installNetworkBlock(context);
    const emulationError = await verifyEmulation(context, emulation);
    const entry: PageContextEntry = { context, emulationError };
    this.labContexts.set(emulationKey, entry);
    return entry;
  }

  async execute(
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    expectKey: string | null
  ): Promise<RunResult> {
    const { bundle, testServer, labOrigin, timeoutMs } = this.input;
    const emulation = expectKey ? bundle.expect[expectKey]?.emulation : undefined;
    const emulationKey = stableEmulationKey(emulation);
    const inputSteps = variant === 'blank' ? undefined : bundle.variants[variant].input;

    if (inputSteps?.some((s) => s.action === 'tap') && emulation?.hasTouch !== true) {
      return {
        ok: false,
        error: 'tap requires emulation.hasTouch',
        trace: [],
        console: [],
      };
    }

    if (bundle.host === 'origin') {
      if (!labOrigin) {
        return {
          ok: false,
          error: 'FR_LAB_ORIGIN_MISSING: host "origin" requires labOrigin',
          trace: [],
          console: [],
        };
      }
      return this.executeOnLab(
        emulationKey,
        emulation,
        variant,
        params,
        mutated,
        inputSteps,
        labOrigin,
        timeoutMs
      );
    }

    if (bundle.network?.mode === 'server') {
      if (!testServer) {
        return {
          ok: false,
          error: 'FR_TEST_SERVER_MISSING: network mode "server" requires testServer',
          trace: [],
          console: [],
        };
      }
      return this.executeOnTestServer(
        emulationKey,
        emulation,
        variant,
        params,
        mutated,
        testServer,
        timeoutMs
      );
    }

    return this.executeOnHarness(
      emulationKey,
      emulation,
      variant,
      params,
      mutated,
      inputSteps,
      timeoutMs
    );
  }

  private async executeOnHarness(
    emulationKey: string,
    emulation: Emulation | undefined,
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    inputSteps: InputStep[] | undefined,
    timeoutMs: number
  ): Promise<RunResult> {
    try {
      const entry = await this.getHarnessContext(emulationKey, emulation);
      if (entry.emulationError) {
        return { ok: false, error: entry.emulationError, trace: [], console: [] };
      }
      entry.engineConsole.length = 0;
      const awaitInput = Boolean(inputSteps && inputSteps.length > 0);
      const effectiveTimeout = timeoutMs + (inputSteps ? 1000 * inputSteps.length : 0);
      const req = {
        bundle: this.input.bundle,
        variant,
        params,
        mutated,
        awaitInput,
        timeoutMs: effectiveTimeout,
      };

      const pending = entry.page.evaluate(
        (r: unknown) =>
          (
            window as unknown as {
              __frHarness: { run(payload: unknown): Promise<RunResult> };
            }
          ).__frHarness.run(r),
        req as unknown
      );

      if (awaitInput && inputSteps) {
        const runIdHandle = await entry.page.waitForFunction(
          () => (window as unknown as { __frHarnessWaiting: string | null }).__frHarnessWaiting,
          undefined,
          { timeout: timeoutMs }
        );
        const runId = (await runIdHandle.jsonValue()) as string;
        const iframeSel = `iframe[data-run-id="${runId}"]`;
        const box = (await entry.page.locator(iframeSel).boundingBox()) ?? { x: 0, y: 0 };
        const frameTarget = entry.page.frameLocator(iframeSel);
        try {
          await replayInputSteps(entry.page, frameTarget, box, inputSteps);
        } finally {
          await entry.page.evaluate(
            (id: string) =>
              (
                window as unknown as {
                  __frHarness: { inputDone(runId: string): void };
                }
              ).__frHarness.inputDone(id),
            runId
          );
        }
      }

      const result = await withTimeout(
        pending,
        effectiveTimeout + 5000,
        `harness ${this.input.bundle.id}/${variant}`
      );
      return result;
    } catch (err) {
      return {
        ok: false,
        error: String((err as Error)?.message ?? err),
        trace: [],
        console: [],
      };
    }
  }

  private async executeOnLab(
    emulationKey: string,
    emulation: Emulation | undefined,
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    inputSteps: InputStep[] | undefined,
    labOrigin: string,
    timeoutMs: number
  ): Promise<RunResult> {
    const entry = await this.getLabContext(emulationKey, emulation);
    if (entry.emulationError) {
      return { ok: false, error: entry.emulationError, trace: [], console: [] };
    }

    const page = await entry.context.newPage();
    try {
      const runId = `lab-${++this.labRunSeq}`;
      const awaitInput = Boolean(inputSteps && inputSteps.length > 0);
      const effectiveTimeout = timeoutMs + (inputSteps ? 1000 * inputSteps.length : 0);

      await page.goto(`${labOrigin}/x/${this.input.bundle.id}/host.html`, {
        waitUntil: 'load',
        timeout: timeoutMs,
      });
      await page.waitForFunction(
        () => typeof (window as unknown as { __frLabRun?: unknown }).__frLabRun === 'function',
        undefined,
        { timeout: timeoutMs }
      );

      const req = {
        channel: 'fr-proof',
        type: 'fr:lab-run',
        runId,
        bundle: this.input.bundle,
        variant,
        params,
        mutated,
        awaitInput,
      };
      await page.evaluate((payload: unknown) => {
        void (
          window as unknown as { __frLabRun: (r: unknown) => Promise<void> }
        ).__frLabRun(payload);
      }, req as unknown);

      if (awaitInput && inputSteps) {
        await page.waitForFunction(
          (id: string) =>
            (window as unknown as { __frAwaitingInput?: string | null }).__frAwaitingInput === id,
          runId,
          { timeout: timeoutMs }
        );
        try {
          await replayInputSteps(page, page, { x: 0, y: 0 }, inputSteps);
        } finally {
          await page.evaluate(() => {
            (window as unknown as { __frInputDone?: () => void }).__frInputDone?.();
          });
        }
      }

      const handle = await page.waitForFunction(
        () => (window as unknown as { __frResult?: RunResult }).__frResult,
        undefined,
        { timeout: effectiveTimeout }
      );
      return (await handle.jsonValue()) as RunResult;
    } catch (err) {
      return {
        ok: false,
        error: String((err as Error)?.message ?? err),
        trace: [],
        console: [],
      };
    } finally {
      await page.close();
    }
  }

  private async executeOnTestServer(
    emulationKey: string,
    emulation: Emulation | undefined,
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    testServer: TestServer,
    timeoutMs: number
  ): Promise<RunResult> {
    const entry = await this.getServerContext(emulationKey, emulation);
    if (entry.emulationError) {
      return { ok: false, error: entry.emulationError, trace: [], console: [] };
    }
    const page = await entry.context.newPage();
    try {
      const url = `${testServer.selfOrigin}/__exp/${this.input.bundle.id}/${variant}?params=${encodeParams(params)}${mutated ? '&mutated=1' : ''}`;
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      const handle = await page.waitForFunction(
        () => (window as unknown as { __frResult?: RunResult }).__frResult !== undefined,
        undefined,
        { timeout: timeoutMs }
      );
      void handle;
      const result = await page.evaluate(
        () => (window as unknown as { __frResult: RunResult }).__frResult
      );
      return result;
    } catch (err) {
      return {
        ok: false,
        error: String((err as Error)?.message ?? err),
        trace: [],
        console: [],
      };
    } finally {
      await page.close();
    }
  }

  async closeAll(): Promise<void> {
    for (const entry of this.harnessContexts.values()) {
      await entry.context.close();
    }
    this.harnessContexts.clear();
    for (const entry of this.serverContexts.values()) {
      await entry.context.close();
    }
    this.serverContexts.clear();
    for (const entry of this.labContexts.values()) {
      await entry.context.close();
    }
    this.labContexts.clear();
  }
}

type OkResult = Extract<RunResult, { ok: true }>;

async function checkVacuity(
  bundle: ExperimentBundle,
  exec: Executor,
  treatment: Map<string, RunResult>,
  control: Map<string, RunResult>
): Promise<VacuityResult> {
  const okKeys = [...treatment.keys()].filter((k) => treatment.get(k)!.ok && control.get(k)!.ok);
  const differs =
    okKeys.length === 0
      ? null
      : okKeys.some(
          (k) => !jsonEqual((treatment.get(k) as OkResult).value, (control.get(k) as OkResult).value)
        );

  const differingKeys = Object.keys(bundle.expect)
    .sort()
    .filter((k) => !jsonEqual(bundle.expect[k].treatment, bundle.expect[k].control))
    .filter((k) => treatment.get(k)?.ok);

  let mutationChanges: boolean | null = null;
  for (const key of differingKeys) {
    const mutated = await exec('treatment', bundle.expect[key].params ?? {}, true, {
      expectKey: key,
    });
    const changed = !mutated.ok || !jsonEqual(mutated.value, (treatment.get(key) as OkResult).value);
    mutationChanges = changed;
    if (changed) break;
  }

  let blankDiffers: boolean | null = null;
  const ref = differingKeys[0];
  if (ref) {
    const blank = await exec('blank', {}, false, { expectKey: null });
    blankDiffers = !blank.ok || !jsonEqual(blank.value, (treatment.get(ref) as OkResult).value);
  }

  const failures = [
    differs === false && 'treatment and control produced identical observations in every case',
    mutationChanges === false &&
      'removing mutation.remove from the treatment did not change the observation',
    blankDiffers === false && 'observe returned the same value on a blank document',
  ].filter(Boolean) as string[];

  return {
    ok: failures.length === 0,
    checks: { differs, mutationChanges, blankDiffers },
    detail: failures.length ? failures.join('; ') : null,
  };
}

export async function runStandard(
  bundle: ExperimentBundle,
  exec: Executor
): Promise<EngineRunOutcome> {
  const cases: Record<string, CaseResult> = {};
  const observedTreatment = new Map<string, RunResult>();
  const observedControl = new Map<string, RunResult>();

  for (const key of Object.keys(bundle.expect).sort()) {
    const { raw, ...evaluation } = await evaluateCase(bundle, key, exec);
    observedTreatment.set(key, raw.treatment);
    observedControl.set(key, raw.control);
    cases[key] = {
      status: evaluation.status,
      observed: evaluation.observed,
      presented: evaluation.presented,
      error: evaluation.error,
    };
  }

  const vacuity = await checkVacuity(bundle, exec, observedTreatment, observedControl);
  if (!vacuity.ok) {
    for (const key of Object.keys(cases)) {
      if (cases[key].status !== 'error') {
        cases[key] = { ...cases[key], status: 'vacuous', error: vacuity.detail };
      }
    }
  }
  return { cases, vacuity };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function asNonNegativeNumber(res: RunResult, label: string): { ok: true; value: number } | { ok: false; error: string } {
  if (!res.ok) return { ok: false, error: `${label}: ${res.error}` };
  if (typeof res.value !== 'number' || !Number.isFinite(res.value) || res.value < 0) {
    return {
      ok: false,
      error: `${label}: observe must return a non-negative finite number (got ${JSON.stringify(res.value)})`,
    };
  }
  return { ok: true, value: res.value };
}

async function collectAlternatingSamples(
  exec: Executor,
  repeat: number,
  params: ParamValues,
  expectKey: string,
  mutated: boolean
): Promise<{ ok: true; treatment: number[]; control: number[] } | { ok: false; error: string }> {
  const treatment: number[] = [];
  const control: number[] = [];

  for (let i = 0; i < repeat; i++) {
    if (i % 2 === 0) {
      const t = asNonNegativeNumber(
        await exec('treatment', params, mutated, { expectKey }),
        mutated ? 'mutated treatment' : 'treatment'
      );
      if (!t.ok) return t;
      treatment.push(t.value);

      const c = asNonNegativeNumber(
        await exec('control', params, false, { expectKey }),
        'control'
      );
      if (!c.ok) return c;
      control.push(c.value);
    } else {
      const c = asNonNegativeNumber(
        await exec('control', params, false, { expectKey }),
        'control'
      );
      if (!c.ok) return c;
      control.push(c.value);

      const t = asNonNegativeNumber(
        await exec('treatment', params, mutated, { expectKey }),
        mutated ? 'mutated treatment' : 'treatment'
      );
      if (!t.ok) return t;
      treatment.push(t.value);
    }
  }

  return { ok: true, treatment, control };
}

export async function runMeasured(
  bundle: ExperimentBundle,
  exec: Executor,
  opts?: { headed?: boolean }
): Promise<EngineRunOutcome> {
  if (!bundle.measured) {
    throw new Error(`Experiment "${bundle.id}" has kind "measured" without a measured config`);
  }
  const { repeat, minRatio } = bundle.measured;
  const cases: Record<string, CaseResult> = {};
  const keys = Object.keys(bundle.expect).sort();
  const okKeys: string[] = [];

  for (const key of keys) {
    const params = bundle.expect[key].params ?? {};
    const collected = await collectAlternatingSamples(exec, repeat, params, key, false);
    if (!collected.ok) {
      cases[key] = {
        status: 'error',
        observed: { treatment: null, control: null },
        presented: null,
        error: collected.error,
      };
      continue;
    }

    if (opts?.headed) {
      console.log(
        `[measured ${bundle.id}/${key}] treatment=[${collected.treatment.map((v) => v.toFixed(2)).join(', ')}] control=[${collected.control.map((v) => v.toFixed(2)).join(', ')}]`
      );
    }

    const tMed = median(collected.treatment);
    const cMed = median(collected.control);
    if (cMed < 1) {
      cases[key] = {
        status: 'error',
        observed: {
          treatment: { median: round(tMed, 3), n: collected.treatment.length },
          control: { median: round(cMed, 3), n: collected.control.length },
          ratio: cMed > 0 ? round(tMed / cMed, 3) : 0,
          pValue: 1,
        },
        presented: null,
        error: 'FR_MEASURE_TOO_SMALL: scale up the workload',
      };
      continue;
    }

    const ratio = tMed / cMed;
    const { pValue } = mannWhitneyGreater(collected.treatment, collected.control);
    const observed: MeasuredObserved = {
      treatment: { median: round(tMed, 3), n: collected.treatment.length },
      control: { median: round(cMed, 3), n: collected.control.length },
      ratio: round(ratio, 3),
      pValue: round(pValue, 6),
    };
    const pass = ratio >= minRatio && pValue < 0.01;
    cases[key] = {
      status: pass ? 'pass' : 'fail',
      observed,
      presented: null,
      error: null,
    };
    okKeys.push(key);
  }

  let mutationChanges: boolean | null = null;
  for (const key of okKeys) {
    const params = bundle.expect[key].params ?? {};
    const mutatedCollected = await collectAlternatingSamples(exec, repeat, params, key, true);
    if (!mutatedCollected.ok) {
      mutationChanges = true;
      break;
    }
    const mtMed = median(mutatedCollected.treatment);
    const mcMed = median(mutatedCollected.control);
    const mRatio = mcMed > 0 ? mtMed / mcMed : 0;
    const { pValue: mPValue } = mannWhitneyGreater(
      mutatedCollected.treatment,
      mutatedCollected.control
    );
    const disappeared = mRatio < minRatio || mPValue >= 0.01;
    mutationChanges = disappeared;
    if (disappeared) break;
  }

  let blankDiffers: boolean | null = null;
  if (okKeys.length > 0) {
    const blank = await exec('blank', {}, false, { expectKey: null });
    blankDiffers =
      !blank.ok ||
      typeof blank.value !== 'number' ||
      !Number.isFinite(blank.value);
  }

  const failures = [
    mutationChanges === false &&
      'removing mutation.remove from the treatment did not make the measured effect disappear',
    blankDiffers === false && 'observe returned a finite number on a blank document',
  ].filter(Boolean) as string[];

  const vacuity: VacuityResult = {
    ok: failures.length === 0,
    checks: { differs: null, mutationChanges, blankDiffers },
    detail: failures.length ? failures.join('; ') : null,
  };

  if (!vacuity.ok) {
    for (const key of Object.keys(cases)) {
      if (cases[key].status !== 'error') {
        cases[key] = { ...cases[key], status: 'vacuous', error: vacuity.detail };
      }
    }
  }

  return { cases, vacuity };
}

export async function runExperimentInEngine(input: EngineRunInput): Promise<EngineRunOutcome> {
  const pool = new ContextPool(input);
  try {
    const exec: Executor = (variant, params, mutated, meta) =>
      pool.execute(variant, params, mutated, meta.expectKey);
    return input.bundle.kind === 'measured'
      ? await runMeasured(input.bundle, exec, { headed: input.headed })
      : await runStandard(input.bundle, exec);
  } finally {
    await pool.closeAll();
  }
}
