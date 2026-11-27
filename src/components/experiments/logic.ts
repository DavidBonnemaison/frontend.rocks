import type { InstrumentStatus } from '@/components/ui/Instrument/StatusLed';
import type { MeasuredSummary } from '@/components/instruments/types';
import type { EngineId } from '@/lib/proof/claim-schema';
import type { ExpectCase, Json, ParamDefinition } from '@/lib/proof/define-experiment';
import { detectBrowser, type UaData } from '@/lib/proof/detect-browser';
import { ENGINE_LABELS } from '@/lib/proof/engine-labels';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import type { CaseStatus, MeasuredObserved, ProofResults } from '@/lib/proof/results-schema';
import { notRunnableReason } from '@/lib/proof/runtime/browser';
import { jsonEqual } from '@/lib/proof/runtime/canonical-json';
import type { ExperimentView } from '@/lib/proof/view-schema';
import type { RecordedCaseEngineEntry, RecordedResults } from './types';

export type ParamValues = Record<string, number | boolean | string>;

export interface ControlDescriptor {
  name: string;
  def: ParamDefinition;
}

export interface SelectedRecordedCase {
  expectKey: string;
  engine: EngineId;
  entry: RecordedCaseEngineEntry;
}

export interface EngineSummaryRow {
  engine: EngineId;
  label: string;
  version: string;
  status: CaseStatus | 'missing';
  symbol: '✓' | '✕' | '?';
}

export const ENGINE_ORDER: readonly EngineId[] = ['chromium', 'firefox', 'webkit'];

export const DEFAULT_VIEW: ExperimentView = {
  instrument: 'diff-view',
  observedPath: '',
  tracePath: null,
  presentedPath: null,
  compare: 'side-by-side',
  smoke: false,
};

export function getDefaultParams(
  bundle: Pick<ExperimentBundle, 'params'>,
  initialParams?: ParamValues,
): ParamValues {
  const out: ParamValues = {};
  for (const [key, def] of Object.entries(bundle.params)) {
    out[key] = initialParams && key in initialParams ? initialParams[key] : def.default;
  }
  return out;
}

export function buildControlsList(bundle: Pick<ExperimentBundle, 'params'>): ControlDescriptor[] {
  return Object.entries(bundle.params).map(([name, def]) => ({ name, def }));
}

export function isRecordedOnly(bundle: Pick<ExperimentBundle, 'liveInBrowser'>): boolean {
  return bundle.liveInBrowser === false;
}

export function canTryItYourself(bundle: ExperimentBundle): boolean {
  const reason = notRunnableReason(bundle);
  return reason === 'input' || reason === 'emulation';
}

export function isMeasuredObserved(value: unknown): value is MeasuredObserved {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.ratio === 'number' &&
    typeof obj.pValue === 'number' &&
    typeof obj.treatment === 'object' &&
    obj.treatment !== null &&
    'median' in obj.treatment
  );
}

export function extractRecordedResults(
  experimentId: string,
  proofResults: ProofResults,
): RecordedResults | null {
  const expCases = proofResults.experiments[experimentId];
  if (!expCases || Object.keys(expCases).length === 0) return null;

  const cases: RecordedResults['cases'] = {};
  for (const [expectKey, byEngine] of Object.entries(expCases)) {
    const engineMap: Partial<Record<EngineId, RecordedCaseEngineEntry>> = {};
    for (const engine of ENGINE_ORDER) {
      const rec = byEngine[engine];
      if (!rec) continue;
      engineMap[engine] = {
        status: rec.status,
        observed: rec.observed,
        presented: rec.presented,
      };
    }
    if (Object.keys(engineMap).length > 0) {
      cases[expectKey] = engineMap;
    }
  }

  if (Object.keys(cases).length === 0) return null;
  return {
    generatedAt: proofResults.generatedAt,
    engines: proofResults.engines,
    cases,
  };
}

/**
 * Finds the expect case whose resolved params match `currentParams`.
 */
export function findMatchingExpect(
  bundle: Pick<ExperimentBundle, 'params' | 'expect'>,
  currentParams: ParamValues,
): { key: string; expectCase: ExpectCase } | null {
  const defaults = getDefaultParams(bundle);
  for (const [key, expectCase] of Object.entries(bundle.expect)) {
    const expectedParams: ParamValues = { ...defaults, ...(expectCase.params ?? {}) };
    const allMatch = Object.keys(expectedParams).every(
      (k) => expectedParams[k] === currentParams[k],
    );
    if (allMatch) {
      return { key, expectCase };
    }
  }
  return null;
}

/**
 * Selects the recorded case for SSR / fallback display:
 * 1. Expect key matching `params` (or first expect key with recorded entries).
 * 2. Preferred engine if provided and present, else `chromium`, else first available engine.
 */
export function selectRecordedCase(
  bundle: Pick<ExperimentBundle, 'params' | 'expect'>,
  recorded: RecordedResults | null,
  params: ParamValues,
  preferredEngine?: EngineId,
): SelectedRecordedCase | null {
  if (!recorded) return null;
  const matched = findMatchingExpect(bundle, params);
  const candidateKeys = [
    ...(matched ? [matched.key] : []),
    ...Object.keys(bundle.expect),
    ...Object.keys(recorded.cases),
  ];

  const seen = new Set<string>();
  for (const key of candidateKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const byEngine = recorded.cases[key];
    if (!byEngine) continue;

    const order: EngineId[] = preferredEngine
      ? [preferredEngine, ...ENGINE_ORDER.filter((e) => e !== preferredEngine)]
      : [...ENGINE_ORDER];

    for (const engine of order) {
      const entry = byEngine[engine];
      if (entry) {
        return { expectKey: key, engine, entry };
      }
    }
  }
  return null;
}

export function getAvailableRecordedEngines(recorded: RecordedResults | null): EngineId[] {
  if (!recorded) return [];
  const present = new Set<EngineId>();
  for (const byEngine of Object.values(recorded.cases)) {
    for (const engine of ENGINE_ORDER) {
      if (byEngine[engine]) present.add(engine);
    }
  }
  return ENGINE_ORDER.filter((e) => present.has(e));
}

export function computeLabStatus(
  bundle: Pick<ExperimentBundle, 'expect'>,
  recorded: RecordedResults | null,
): InstrumentStatus {
  if (!recorded) return 'pending';
  const keys = Object.keys(bundle.expect);
  let hasPass = false;
  let hasFail = false;
  let hasError = false;

  for (const key of keys) {
    const byEngine = recorded.cases[key];
    if (!byEngine) continue;
    for (const entry of Object.values(byEngine)) {
      if (!entry) continue;
      if (entry.status === 'pass') hasPass = true;
      else if (entry.status === 'fail' || entry.status === 'vacuous') hasFail = true;
      else if (entry.status === 'error') hasError = true;
    }
  }

  if (hasPass && !hasFail && !hasError) return 'proven';
  if (hasPass && hasFail) return 'diverges';
  if (hasFail) return 'failed';
  return 'pending';
}

export function summarizeEngineStatuses(
  bundle: Pick<ExperimentBundle, 'expect'>,
  recorded: RecordedResults | null,
): EngineSummaryRow[] {
  if (!recorded) return [];
  const keys = Object.keys(bundle.expect);
  const rows: EngineSummaryRow[] = [];

  for (const engine of ENGINE_ORDER) {
    const statuses: CaseStatus[] = [];
    for (const key of keys) {
      const entry = recorded.cases[key]?.[engine];
      if (entry) statuses.push(entry.status);
    }
    if (statuses.length === 0) continue;

    let aggregate: CaseStatus;
    if (statuses.every((s) => s === 'pass')) {
      aggregate = 'pass';
    } else if (statuses.some((s) => s === 'fail')) {
      aggregate = 'fail';
    } else if (statuses.some((s) => s === 'vacuous')) {
      aggregate = 'vacuous';
    } else {
      aggregate = 'error';
    }

    const symbol: '✓' | '✕' | '?' =
      aggregate === 'pass' ? '✓' : aggregate === 'fail' ? '✕' : '?';

    rows.push({
      engine,
      label: ENGINE_LABELS[engine],
      version: recorded.engines[engine] ?? '',
      status: aggregate,
      symbol,
    });
  }
  return rows;
}

export function computeLabPresentation(
  bundle: Pick<ExperimentBundle, 'id' | 'variants'>,
  ctx?: { reproExperimentId?: string; pieceColor?: string },
): {
  mode: 'explore' | 'repro';
  labels: { treatment: string; control: string };
  highlightColor: string | null;
} {
  const isRepro = Boolean(ctx?.reproExperimentId && ctx.reproExperimentId === bundle.id);
  const mode: 'explore' | 'repro' = isRepro ? 'repro' : 'explore';
  const labels = isRepro
    ? { treatment: 'As shipped', control: 'With the fix' }
    : { treatment: bundle.variants.treatment.label, control: bundle.variants.control.label };
  const highlightColor = ctx?.pieceColor ? `var(--piece-${ctx.pieceColor})` : null;
  return { mode, labels, highlightColor };
}

export function isStaleRunToken(activeToken: number, resultToken: number): boolean {
  return resultToken < activeToken;
}

export function formatShortVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
}

export function formatRecordedCaption(
  engine: EngineId,
  version: string | undefined,
  generatedAt: string,
): string {
  const engineName = ENGINE_LABELS[engine];
  const ver = version ? ` ${formatShortVersion(version)}` : '';
  const date = generatedAt.slice(0, 10);
  return `Recorded by the nightly run · ${engineName}${ver} · ${date}`;
}

export function formatLiveBrowserCaption(ua: string, uaData?: UaData): string {
  const detected = detectBrowser(ua, uaData);
  const name = detected.brand ?? detected.engine;
  const ver = detected.version ? ` ${detected.version}` : '';
  return `Recorded in your browser · ${name}${ver}`;
}

export function checkLiveAgainstExpect(
  bundle: Pick<ExperimentBundle, 'params' | 'expect' | 'kind'>,
  currentParams: ParamValues,
  variant: 'treatment' | 'control',
  observed: Json,
): 'matches' | 'differs' | null {
  if (bundle.kind === 'measured') return null;
  const matched = findMatchingExpect(bundle, currentParams);
  if (!matched) return null;
  const expected = matched.expectCase[variant];
  if (expected === null || expected === undefined) return null;
  return jsonEqual(observed, expected) ? 'matches' : 'differs';
}

export function extractRecordedObservation(
  entry: RecordedCaseEngineEntry | null,
  variant: 'treatment' | 'control',
): {
  observed: Json | undefined;
  compareObserved: Json | undefined;
  presented: Json | null;
  comparePresented: Json | null;
  measured: MeasuredSummary | undefined;
} {
  if (!entry) {
    return {
      observed: undefined,
      compareObserved: undefined,
      presented: null,
      comparePresented: null,
      measured: undefined,
    };
  }
  const other: 'treatment' | 'control' = variant === 'treatment' ? 'control' : 'treatment';
  if (isMeasuredObserved(entry.observed)) {
    return {
      observed: undefined,
      compareObserved: undefined,
      presented: entry.presented ? entry.presented[variant] : null,
      comparePresented: entry.presented ? entry.presented[other] : null,
      measured: entry.observed,
    };
  }
  return {
    observed: entry.observed[variant],
    compareObserved: entry.observed[other],
    presented: entry.presented ? entry.presented[variant] : null,
    comparePresented: entry.presented ? entry.presented[other] : null,
    measured: undefined,
  };
}
