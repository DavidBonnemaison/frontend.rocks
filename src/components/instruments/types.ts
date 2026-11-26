export const INSTRUMENT_NAMES = [
  'queue-view',
  'timeline',
  'layer-stack',
  'box-tree',
  'frame-budget',
  'event-path',
  'network-waterfall',
  'diff-view',
] as const;

export type InstrumentName = (typeof INSTRUMENT_NAMES)[number];

export interface MeasuredSummary {
  treatment: { median: number; n: number };
  control: { median: number; n: number };
  ratio: number;
  pValue: number;
}

export interface InstrumentProps<O, T = never> {
  observed: O;
  compareObserved?: O;
  trace?: T;
  compareTrace?: T;
  measured?: MeasuredSummary;
  labels: { primary: string; secondary?: string };
  caption: string;
  figureNumber?: number;
  highlight?: string[];
  highlightColor?: string;
}
