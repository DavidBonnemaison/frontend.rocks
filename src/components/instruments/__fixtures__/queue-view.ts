import type { QueueObserved, QueueTrace } from '../queue-view/schema';

export const QUEUE_VIEW_ORDINAL: QueueObserved = {
  events: [
    { seq: 0, op: 'run-start', queue: 'task', label: 'script' },
    { seq: 1, op: 'schedule', queue: 'task', label: 'setTimeout cb' },
    { seq: 2, op: 'schedule', queue: 'microtask', label: 'promise.then #1' },
    { seq: 3, op: 'schedule', queue: 'microtask', label: 'promise.then #2' },
    { seq: 4, op: 'schedule', queue: 'raf', label: 'rAF paint' },
    { seq: 5, op: 'run-end', queue: 'task', label: 'script' },
    { seq: 6, op: 'run-start', queue: 'microtask', label: 'promise.then #1' },
    { seq: 7, op: 'run-end', queue: 'microtask', label: 'promise.then #1' },
    { seq: 8, op: 'run-start', queue: 'microtask', label: 'promise.then #2' },
    { seq: 9, op: 'run-end', queue: 'microtask', label: 'promise.then #2' },
    { seq: 10, op: 'run-start', queue: 'raf', label: 'rAF paint' },
    { seq: 11, op: 'run-end', queue: 'raf', label: 'rAF paint' },
    { seq: 12, op: 'render', queue: 'render', label: 'render' },
    { seq: 13, op: 'run-start', queue: 'task', label: 'setTimeout cb' },
    { seq: 14, op: 'run-end', queue: 'task', label: 'setTimeout cb' },
  ],
};

export const QUEUE_VIEW_TRACE: QueueTrace = [
  { seq: 0, t: 0.0 },
  { seq: 1, t: 0.1 },
  { seq: 2, t: 0.2 },
  { seq: 3, t: 0.3 },
  { seq: 4, t: 0.4 },
  { seq: 5, t: 0.6 },
  { seq: 6, t: 0.8 },
  { seq: 7, t: 1.0 },
  { seq: 8, t: 1.1 },
  { seq: 9, t: 1.3 },
  { seq: 10, t: 8.4 },
  { seq: 11, t: 8.9 },
  { seq: 12, t: 9.2 },
  { seq: 13, t: 10.5 },
  { seq: 14, t: 10.8 },
];

export const QUEUE_VIEW_COMPARE: QueueObserved = {
  events: [
    { seq: 0, op: 'run-start', queue: 'task', label: 'script' },
    { seq: 1, op: 'schedule', queue: 'task', label: 'setTimeout cb' },
    { seq: 2, op: 'run-end', queue: 'task', label: 'script' },
    { seq: 3, op: 'run-start', queue: 'task', label: 'setTimeout cb' },
    { seq: 4, op: 'run-end', queue: 'task', label: 'setTimeout cb' },
  ],
};
