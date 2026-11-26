import { describe, expect, it } from 'vitest';
import {
  buildQueueSnapshots,
  formatQueueAnnouncement,
  indexQueueTimings,
} from '@/components/instruments/queue-view/build';
import {
  QueueObservedSchema,
  QueueTraceSchema,
  type QueueEvent,
} from '@/components/instruments/queue-view/schema';
import {
  QUEUE_VIEW_ORDINAL,
  QUEUE_VIEW_TRACE,
} from '@/components/instruments/__fixtures__/queue-view';

describe('QueueView buildQueueSnapshots', () => {
  it('produces the expected snapshot sequence for the canonical fixture', () => {
    expect(QueueObservedSchema.safeParse(QUEUE_VIEW_ORDINAL).success).toBe(true);
    expect(QueueTraceSchema.safeParse(QUEUE_VIEW_TRACE).success).toBe(true);

    const snaps = buildQueueSnapshots(QUEUE_VIEW_ORDINAL.events);
    expect(snaps).toHaveLength(QUEUE_VIEW_ORDINAL.events.length);

    // Step 0: script starts without prior schedule
    expect(snaps[0].running).toEqual({
      queue: 'task',
      label: 'script (scheduled before recording)',
    });
    expect(snaps[0].t).toBeNull();

    // After scheduling setTimeout, 2 promises, 1 rAF
    expect(snaps[4].task).toEqual(['setTimeout cb']);
    expect(snaps[4].microtask).toEqual(['promise.then #1', 'promise.then #2']);
    expect(snaps[4].raf).toEqual(['rAF paint']);

    // Step 6: promise.then #1 starts running, removed from microtask queue
    expect(snaps[6].running).toEqual({ queue: 'microtask', label: 'promise.then #1' });
    expect(snaps[6].microtask).toEqual(['promise.then #2']);
    expect(snaps[6].task).toEqual(['setTimeout cb']);

    // Step 12: render produces running render
    expect(snaps[12].running).toEqual({ queue: 'render', label: 'render' });

    // Step 14: all queues drained, idle
    expect(snaps[14].running).toBeNull();
    expect(snaps[14].task).toEqual([]);
    expect(snaps[14].microtask).toEqual([]);
    expect(snaps[14].raf).toEqual([]);
  });

  it('sorts events by seq even when input is out of order', () => {
    const unordered: QueueEvent[] = [
      { seq: 2, op: 'run-start', queue: 'microtask', label: 'p1' },
      { seq: 0, op: 'schedule', queue: 'microtask', label: 'p1' },
      { seq: 1, op: 'schedule', queue: 'microtask', label: 'p2' },
    ];
    const snaps = buildQueueSnapshots(unordered);
    expect(snaps.map((s) => s.seq)).toEqual([0, 1, 2]);
    expect(snaps[2].running).toEqual({ queue: 'microtask', label: 'p1' });
    expect(snaps[2].microtask).toEqual(['p2']);
  });

  it('handles run-start without prior schedule and empty queues', () => {
    const snaps = buildQueueSnapshots([
      { seq: 0, op: 'run-start', queue: 'task', label: 'orphan' },
      { seq: 1, op: 'run-end', queue: 'task', label: 'orphan' },
    ]);
    expect(snaps[0].running).toEqual({
      queue: 'task',
      label: 'orphan (scheduled before recording)',
    });
    expect(snaps[1].running).toBeNull();
    expect(snaps[1].task).toEqual([]);
  });

  it('handles 500 events within schema limits', () => {
    const events: QueueEvent[] = [];
    for (let i = 0; i < 250; i++) {
      events.push({ seq: i * 2, op: 'schedule', queue: 'task', label: `t${i}` });
      events.push({ seq: i * 2 + 1, op: 'run-start', queue: 'task', label: `t${i}` });
    }
    expect(QueueObservedSchema.safeParse({ events }).success).toBe(true);
    const snaps = buildQueueSnapshots(events);
    expect(snaps).toHaveLength(500);
    expect(snaps[499].task).toEqual([]);
    expect(snaps[499].running).toEqual({ queue: 'task', label: 't249' });
  });

  it('merges trace timings by seq without changing queue state', () => {
    const timings = indexQueueTimings(QUEUE_VIEW_TRACE);
    const withoutTrace = buildQueueSnapshots(QUEUE_VIEW_ORDINAL.events);
    const withTrace = buildQueueSnapshots(QUEUE_VIEW_ORDINAL.events, timings);

    expect(withTrace[6].t).toBe(0.8);
    expect(withoutTrace[6].t).toBeNull();
    expect(withTrace[6].running).toEqual(withoutTrace[6].running);
    expect(withTrace[6].task).toEqual(withoutTrace[6].task);
    expect(withTrace[6].microtask).toEqual(withoutTrace[6].microtask);
  });

  it('formats accessible step announcements', () => {
    const snaps = buildQueueSnapshots(QUEUE_VIEW_ORDINAL.events);
    const msg = formatQueueAnnouncement(snaps[6], 6, snaps.length);
    expect(msg).toContain('Step 7 of 15');
    expect(msg).toContain('promise.then #1');
    expect(msg).toContain('1 task waiting');
  });
});
