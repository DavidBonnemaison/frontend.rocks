export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
}

export interface ExperimentContext {
  doc: Document;
  win: Window;
  params: Record<string, number | boolean | string>;
  settle(): Promise<void>;
  trace: Json[];
  console: ConsoleEntry[];
}

export type ParamDefinition =
  | {
      kind: 'range';
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
    }
  | { kind: 'toggle'; label: string; default: boolean }
  | { kind: 'select'; label: string; options: string[]; default: string };

/** Trusted input steps replayed by the test runner. Selectors follow INPUT_SELECTOR_RE. */
export type InputStep =
  | { action: 'click'; selector: string; button?: 'left' | 'right'; clickCount?: 1 | 2 }
  | { action: 'tap'; selector: string }
  | { action: 'press'; key: string }
  | { action: 'type'; selector: string; text: string }
  | { action: 'move'; from: [number, number]; to: [number, number]; steps: number }
  | { action: 'wheel'; deltaX: number; deltaY: number }
  | { action: 'wait'; ms: number };

export interface Emulation {
  deviceScaleFactor?: 1 | 2 | 3;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
  forcedColors?: 'active' | 'none';
  hasTouch?: boolean;
}

export interface VariantSources {
  label: string;
  html?: string;
  css?: string;
  js?: string;
  input?: InputStep[];
}

export interface ExpectCase {
  params?: Record<string, number | boolean | string>;
  treatment: Json;
  control: Json;
  emulation?: Emulation;
}

export interface NetworkRoute {
  id: string;
  origin: 'self' | 'cross';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  path: string;
  status: number;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
}

export type ExperimentKind = 'fixture' | 'trace' | 'console' | 'network' | 'measured';
export type VendorLibrary = 'react' | 'react-dom';

export interface ExperimentDefinition {
  id: string;
  title: string;
  question: string;
  kind: ExperimentKind;
  fixture: { html: string; css?: string; js?: string };
  params?: Record<string, ParamDefinition>;
  variants: { treatment: VariantSources; control: VariantSources };
  mutation: { variant: 'treatment'; remove: string };
  observe: (ctx: ExperimentContext) => Json | Promise<Json>;
  present?: (ctx: ExperimentContext) => Json | Promise<Json>;
  expect: Record<string, ExpectCase>;
  measured?: { repeat: number; metric: string; minRatio: number };
  viewport?: { width: number; height: number };
  network?: { mode: 'shim' | 'server'; routes: NetworkRoute[] };
  consoleSource?: 'page' | 'engine';
  host?: 'opaque' | 'origin';
  serviceWorker?: string;
  vendor?: VendorLibrary[];
}

export type RunVariant = 'treatment' | 'control' | 'blank';

/** Identity helper used solely for static typing in content/experiments/<id>/experiment.ts. */
export function defineExperiment<const T extends ExperimentDefinition>(definition: T): T {
  return definition;
}
