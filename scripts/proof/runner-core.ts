import type { Browser, BrowserContext, ConsoleMessage, Page } from '@playwright/test';
import type { EngineId } from '../../src/lib/proof/claim-schema';
import type { ConsoleEntry, RunVariant } from '../../src/lib/proof/define-experiment';
import type { ExperimentBundle } from '../../src/lib/proof/experiment-schema';
import type { CaseResult, VacuityResult } from '../../src/lib/proof/results-schema';
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

function stableEmulationKey(emulation: Record<string, unknown> | undefined): string {
  if (!emulation || Object.keys(emulation).length === 0) return '{}';
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(emulation).sort()) {
    if (emulation[k] !== undefined) sorted[k] = emulation[k];
  }
  return JSON.stringify(sorted);
}

interface HarnessContextEntry {
  context: BrowserContext;
  page: Page;
  engineConsole: ConsoleEntry[];
}

class ContextPool {
  private readonly input: EngineRunInput;
  private readonly harnessContexts = new Map<string, HarnessContextEntry>();
  private readonly serverContexts = new Map<string, BrowserContext>();
  private readonly allowedOrigins: Set<string>;

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

  private async getHarnessContext(emulationKey: string): Promise<HarnessContextEntry> {
    const existing = this.harnessContexts.get(emulationKey);
    if (existing) return existing;

    const { browser, bundle, harnessOrigin } = this.input;
    const viewport = {
      width: Math.max(1960, bundle.viewport.width + 40),
      height: Math.max(1240, bundle.viewport.height + 40),
    };
    const context = await browser.newContext({ viewport });
    await this.installNetworkBlock(context);

    const page = await context.newPage();
    const engineConsole: ConsoleEntry[] = [];
    if (bundle.consoleSource === 'engine') {
      page.on('console', (msg: ConsoleMessage) => {
        const level = CONSOLE_LEVEL_MAP[msg.type()];
        if (level) engineConsole.push({ level, text: msg.text() });
      });
      await page.exposeFunction('__frEngineConsole', () => engineConsole.splice(0));
    }

    await page.goto(`${harnessOrigin}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => typeof (window as unknown as { __frHarness?: unknown }).__frHarness === 'object'
    );

    const entry: HarnessContextEntry = { context, page, engineConsole };
    this.harnessContexts.set(emulationKey, entry);
    return entry;
  }

  private async getServerContext(emulationKey: string): Promise<BrowserContext> {
    const existing = this.serverContexts.get(emulationKey);
    if (existing) return existing;

    const { browser, bundle } = this.input;
    const context = await browser.newContext({ viewport: { ...bundle.viewport } });
    await this.installNetworkBlock(context);
    this.serverContexts.set(emulationKey, context);
    return context;
  }

  async execute(
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    expectKey: string | null
  ): Promise<RunResult> {
    const { bundle, testServer, timeoutMs } = this.input;
    const emulation = expectKey ? bundle.expect[expectKey]?.emulation : undefined;
    const emulationKey = stableEmulationKey(emulation);

    if (bundle.host === 'origin') {
      return {
        ok: false,
        error: 'FR_HOST_ORIGIN_UNSUPPORTED: host "origin" requires the lab executor',
        trace: [],
        console: [],
      };
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
      return this.executeOnTestServer(emulationKey, variant, params, mutated, testServer, timeoutMs);
    }

    return this.executeOnHarness(emulationKey, variant, params, mutated, timeoutMs);
  }

  private async executeOnHarness(
    emulationKey: string,
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    timeoutMs: number
  ): Promise<RunResult> {
    try {
      const entry = await this.getHarnessContext(emulationKey);
      entry.engineConsole.length = 0;
      const result = await withTimeout(
        entry.page.evaluate(
          (req) => window.__frHarness.run(req),
          {
            bundle: this.input.bundle,
            variant,
            params,
            mutated,
            timeoutMs,
          }
        ),
        timeoutMs + 5000,
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

  private async executeOnTestServer(
    emulationKey: string,
    variant: RunVariant,
    params: ParamValues,
    mutated: boolean,
    testServer: TestServer,
    timeoutMs: number
  ): Promise<RunResult> {
    const context = await this.getServerContext(emulationKey);
    const page = await context.newPage();
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
    for (const ctx of this.serverContexts.values()) {
      await ctx.close();
    }
    this.serverContexts.clear();
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

export async function runExperimentInEngine(input: EngineRunInput): Promise<EngineRunOutcome> {
  const pool = new ContextPool(input);
  try {
    const exec: Executor = (variant, params, mutated, meta) =>
      pool.execute(variant, params, mutated, meta.expectKey);
    return await runStandard(input.bundle, exec);
  } finally {
    await pool.closeAll();
  }
}
