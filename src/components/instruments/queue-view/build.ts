import type { QueueEvent, QueueTrace } from './schema';

export interface QueueSnapshot {
  seq: number;
  t: number | null;
  running: { queue: string; label: string } | null;
  task: string[];
  microtask: string[];
  raf: string[];
  cause: QueueEvent;
}

export function indexQueueTimings(trace?: QueueTrace): Map<number, number> {
  const map = new Map<number, number>();
  if (!trace) return map;
  for (const entry of trace) {
    map.set(entry.seq, entry.t);
  }
  return map;
}

export function buildQueueSnapshots(
  events: QueueEvent[],
  timings?: Map<number, number>,
): QueueSnapshot[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const queues: Record<'task' | 'microtask' | 'raf', string[]> = {
    task: [],
    microtask: [],
    raf: [],
  };
  let running: { queue: string; label: string } | null = null;
  const snapshots: QueueSnapshot[] = [];

  for (const ev of sorted) {
    if (ev.op === 'schedule') {
      if (ev.queue === 'task' || ev.queue === 'microtask' || ev.queue === 'raf') {
        queues[ev.queue].push(ev.label);
      }
    } else if (ev.op === 'run-start') {
      if (ev.queue === 'task' || ev.queue === 'microtask' || ev.queue === 'raf') {
        const idx = queues[ev.queue].indexOf(ev.label);
        if (idx >= 0) {
          queues[ev.queue].splice(idx, 1);
          running = { queue: ev.queue, label: ev.label };
        } else {
          running = { queue: ev.queue, label: `${ev.label} (scheduled before recording)` };
        }
      } else {
        running = { queue: ev.queue, label: ev.label };
      }
    } else if (ev.op === 'run-end') {
      running = null;
    } else if (ev.op === 'render') {
      running = { queue: 'render', label: 'render' };
    }

    const t = timings && timings.has(ev.seq) ? (timings.get(ev.seq) ?? null) : null;
    snapshots.push({
      seq: ev.seq,
      t,
      running: running ? { ...running } : null,
      task: [...queues.task],
      microtask: [...queues.microtask],
      raf: [...queues.raf],
      cause: ev,
    });
  }

  return snapshots;
}

export function formatQueueAnnouncement(
  snapshot: QueueSnapshot,
  index: number,
  total: number,
): string {
  const stepNum = index + 1;
  const waitingParts: string[] = [];
  if (snapshot.task.length > 0) {
    waitingParts.push(`${snapshot.task.length} task${snapshot.task.length === 1 ? '' : 's'} waiting`);
  }
  if (snapshot.microtask.length > 0) {
    waitingParts.push(
      `${snapshot.microtask.length} microtask${snapshot.microtask.length === 1 ? '' : 's'} waiting`,
    );
  }
  if (snapshot.raf.length > 0) {
    waitingParts.push(`${snapshot.raf.length} rAF waiting`);
  }
  const waitingText = waitingParts.length > 0 ? ` ${waitingParts.join(', ')}.` : '';

  if (snapshot.cause.op === 'schedule') {
    return `Step ${stepNum} of ${total}: scheduled ${snapshot.cause.label} in the ${snapshot.cause.queue} queue.${waitingText}`;
  }
  if (snapshot.cause.op === 'run-start' && snapshot.running) {
    return `Step ${stepNum} of ${total}: running ${snapshot.running.label} from the ${snapshot.running.queue} queue.${waitingText}`;
  }
  if (snapshot.cause.op === 'run-end') {
    return `Step ${stepNum} of ${total}: finished ${snapshot.cause.label}.${waitingText}`;
  }
  return `Step ${stepNum} of ${total}: browser render step.${waitingText}`;
}
