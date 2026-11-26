import type { TimelineObserved, TimelineTrace } from '../timeline/schema';

export const TIMELINE_ORDINAL: TimelineObserved = {
  events: [
    { seq: 0, lane: 'user', label: 'click #pay', status: 'neutral' },
    { seq: 1, lane: 'main-thread', label: 'handler', status: 'ok' },
    { seq: 2, lane: 'network', label: 'POST /charge #1', status: 'warn' },
    { seq: 3, lane: 'user', label: 'click #pay (2)', status: 'neutral' },
    { seq: 4, lane: 'network', label: 'POST /charge #2', status: 'fail' },
  ],
};

export const TIMELINE_TRACE: TimelineTrace = [
  { seq: 0, t: 0 },
  { seq: 1, t: 2, duration: 8 },
  { seq: 2, t: 11, duration: 18 },
  { seq: 3, t: 15 },
  { seq: 4, t: 17, duration: 20 },
];

export const TIMELINE_COMPARE: TimelineObserved = {
  events: [
    { seq: 0, lane: 'user', label: 'click #pay', status: 'neutral' },
    { seq: 1, lane: 'main-thread', label: 'disable button', status: 'ok' },
    { seq: 2, lane: 'network', label: 'POST /charge #1', status: 'ok' },
  ],
};

export const TIMELINE_COMPARE_TRACE: TimelineTrace = [
  { seq: 0, t: 0 },
  { seq: 1, t: 1, duration: 2 },
  { seq: 2, t: 4, duration: 19 },
];
