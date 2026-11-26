import type { MeasuredSummary } from '../types';
import type { FrameBudgetTrace } from '../frame-budget/schema';

export const FRAME_BUDGET_MEASURED: MeasuredSummary = {
  treatment: { median: 182.4, n: 15 },
  control: { median: 21.0, n: 15 },
  ratio: 8.69,
  pValue: 0.0002,
};

export const FRAME_BUDGET_TRACE_60HZ: FrameBudgetTrace = {
  frames: [
    { start: 0, end: 16.6 },
    { start: 16.6, end: 33.3 },
    { start: 33.3, end: 50.0 },
    { start: 50.0, end: 66.6 },
    { start: 66.6, end: 132.4 },
    { start: 132.4, end: 149.1 },
    { start: 149.1, end: 165.8 },
    { start: 165.8, end: 182.4 },
    { start: 182.4, end: 199.1 },
    { start: 199.1, end: 215.7 },
    { start: 215.7, end: 232.4 },
    { start: 232.4, end: 249.0 },
  ],
  longTasks: [{ start: 68, duration: 62 }],
  marks: [{ t: 66.6, label: 'thrash-loop' }],
};

export const FRAME_BUDGET_TRACE_SHORT: FrameBudgetTrace = {
  frames: [
    { start: 0, end: 16.6 },
    { start: 16.6, end: 33.2 },
    { start: 33.2, end: 49.9 },
  ],
  longTasks: [],
  marks: [],
};
