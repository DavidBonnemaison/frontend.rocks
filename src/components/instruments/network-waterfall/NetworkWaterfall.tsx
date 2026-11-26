'use client';

import React, { useId, useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import { createLinearScale, niceTicks } from '../timeline/scale';
import type { InstrumentProps } from '../types';
import {
  computeWaterfallDomain,
  summarizeNetworkRequests,
  type NetworkObserved,
  type NetworkTrace,
  type NetworkTraceEntry,
} from './schema';

markInstrumentLoaded('network-waterfall');

const BAR_SVG_W = 200;
const BAR_SVG_H = 20;

export default function NetworkWaterfall({
  observed,
  compareObserved,
  trace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<NetworkObserved, NetworkTrace>) {
  const hatchId = `nw-hatch-${useId().replace(/:/g, '')}`;

  const sorted = useMemo(
    () => [...observed.requests].sort((a, b) => a.seq - b.seq),
    [observed.requests],
  );
  const groups = useMemo(() => summarizeNetworkRequests(sorted), [sorted]);
  const compareGroups = useMemo(
    () => (compareObserved ? summarizeNetworkRequests(compareObserved.requests) : null),
    [compareObserved],
  );

  const traceMap = useMemo(() => {
    const map = new Map<number, NetworkTraceEntry>();
    if (trace) {
      for (const entry of trace) map.set(entry.seq, entry);
    }
    return map;
  }, [trace]);

  const domain = useMemo(() => computeWaterfallDomain(trace), [trace]);
  const scale = useMemo(
    () => (domain ? createLinearScale(domain, [4, BAR_SVG_W - 4]) : null),
    [domain],
  );
  const ticks = useMemo(() => (domain ? niceTicks(domain, 4) : []), [domain]);

  if (sorted.length === 0) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
      />
    );
  }

  const summaryText = groups.map((g) => `${g.key} ×${g.count}`).join(', ');

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={`${sorted.length} requests recorded: ${summaryText}.`}
    >
      <div className="inst-nw-summary" aria-label="Request counts">
        {groups.map((g) => (
          <span key={g.key} className="inst-nw-badge" data-dup={g.count > 1 ? 'true' : 'false'}>
            {g.key} ×{g.count}
          </span>
        ))}
        {compareGroups
          ? compareGroups.map((g) => (
              <span
                key={`cmp-${g.key}`}
                className="inst-nw-badge"
                style={{ borderStyle: 'dashed', color: 'var(--inst-ink-muted)' }}
              >
                {labels.secondary ?? 'Control'}: {g.key} ×{g.count}
              </span>
            ))
          : null}
      </div>

      <table className="inst-nw-table">
        <caption className="inst-sr">{caption}</caption>
        <thead>
          <tr>
            <th>#</th>
            <th>Method</th>
            <th>Path</th>
            <th>Outcome</th>
            <th className="inst-nw-bar-cell">
              {domain ? (
                <svg
                  className="inst-svg"
                  viewBox={`0 0 ${BAR_SVG_W} 16`}
                  aria-hidden="true"
                  focusable="false"
                >
                  <line
                    x1="4"
                    y1="14.5"
                    x2={BAR_SVG_W - 4}
                    y2="14.5"
                    stroke="var(--inst-rule)"
                    strokeWidth="0.5"
                  />
                  {ticks.map((tick) => {
                    const x = Math.round(scale ? scale(tick) : 4) + 0.5;
                    return (
                      <text key={tick} x={x} y="10" textAnchor="middle" className="inst-svg-muted">
                        {`${tick}ms`}
                      </text>
                    );
                  })}
                </svg>
              ) : (
                'Order'
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((req, idx) => {
            const tr = traceMap.get(req.seq);
            const isPending =
              req.outcome === 'pending' || (tr !== undefined && tr.end === null);
            const isFailed =
              req.outcome === 'aborted' ||
              req.outcome === 'blocked' ||
              (typeof req.outcome === 'number' && req.outcome >= 400);

            let barX = 4;
            let barW = BAR_SVG_W - 8;
            if (scale && domain && tr) {
              barX = scale(tr.start);
              const endVal = tr.end !== null ? tr.end : domain[1];
              barW = Math.max(4, scale(endVal) - barX);
            }

            const headerEntries = req.headers ? Object.entries(req.headers) : [];

            return (
              <tr key={`req-${req.seq}-${idx}`}>
                <td>{idx + 1}</td>
                <td>{req.method}</td>
                <td>
                  <div>{req.path}</div>
                  {headerEntries.length > 0 ? (
                    <details className="inst-nw-details">
                      <summary>Headers ({headerEntries.length})</summary>
                      <pre className="inst-nw-headers">
                        {headerEntries.map(([k, v]) => `${k}: ${v}`).join('\n')}
                      </pre>
                    </details>
                  ) : null}
                </td>
                <td>{String(req.outcome)}</td>
                <td className="inst-nw-bar-cell">
                  <svg
                    className="inst-svg"
                    viewBox={`0 0 ${BAR_SVG_W} ${BAR_SVG_H}`}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <defs>
                      <pattern
                        id={`${hatchId}-${idx}`}
                        width="6"
                        height="6"
                        patternUnits="userSpaceOnUse"
                        patternTransform="rotate(45)"
                      >
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="6"
                          stroke="var(--inst-ink-muted)"
                          strokeWidth="1"
                        />
                      </pattern>
                    </defs>
                    <rect
                      x={Math.round(barX) + 0.5}
                      y="3.5"
                      width={Math.round(barW)}
                      height="13"
                      fill={isPending ? `url(#${hatchId}-${idx})` : 'var(--inst-paper)'}
                      stroke={
                        isFailed
                          ? 'var(--inst-fail)'
                          : isPending
                            ? 'var(--inst-ink-muted)'
                            : 'var(--inst-ink)'
                      }
                      strokeWidth="1"
                      strokeDasharray={isPending ? '3 3' : undefined}
                    />
                  </svg>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </InstrumentFrame>
  );
}
