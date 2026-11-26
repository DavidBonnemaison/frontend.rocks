import { z } from 'zod';

export const NetworkRequestSchema = z.object({
  seq: z.number().int().nonnegative(),
  method: z.string().max(10),
  path: z.string().max(200),
  outcome: z.union([
    z.number().int(),
    z.literal('aborted'),
    z.literal('blocked'),
    z.literal('pending'),
  ]),
  headers: z.record(z.string(), z.string()).optional(),
});

export type NetworkRequest = z.infer<typeof NetworkRequestSchema>;

export const NetworkObservedSchema = z.object({
  requests: z.array(NetworkRequestSchema).max(200),
});

export type NetworkObserved = z.infer<typeof NetworkObservedSchema>;

export const NetworkTraceEntrySchema = z.object({
  seq: z.number().int(),
  start: z.number(),
  end: z.number().nullable(),
});

export type NetworkTraceEntry = z.infer<typeof NetworkTraceEntrySchema>;

export const NetworkTraceSchema = z.array(NetworkTraceEntrySchema);

export type NetworkTrace = z.infer<typeof NetworkTraceSchema>;

export interface RequestGroupSummary {
  key: string;
  method: string;
  path: string;
  count: number;
}

export function summarizeNetworkRequests(requests: NetworkRequest[]): RequestGroupSummary[] {
  const map = new Map<string, RequestGroupSummary>();
  for (const req of requests) {
    const key = `${req.method} ${req.path}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { key, method: req.method, path: req.path, count: 1 });
    }
  }
  return [...map.values()];
}

export function computeWaterfallDomain(trace?: NetworkTrace): [number, number] | null {
  if (!trace || trace.length === 0) return null;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const entry of trace) {
    if (entry.start < minStart) minStart = entry.start;
    const end = entry.end ?? entry.start;
    if (end > maxEnd) maxEnd = end;
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return null;
  const start = Math.min(0, minStart);
  const end = maxEnd <= start ? start + 1 : maxEnd;
  return [start, end];
}
