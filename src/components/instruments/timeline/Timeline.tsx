'use client';

import React, { useId, useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import { useStepper } from '../useStepper';
import { createLinearScale, niceTicks } from './scale';
import type { TimelineEvent, TimelineObserved, TimelineTrace, TimelineTraceEntry } from './schema';

markInstrumentLoaded('timeline');

const SVG_WIDTH = 640;
const LANE_COL_W = 128;
const RIGHT_PAD = 24;
const TOP_AXIS_H = 26;
const LANE_ROW_H = 38;
const BOTTOM_PAD = 12;

interface EnrichedTimelineEvent extends TimelineEvent {
  orderIndex: number;
  t: number | null;
  duration: number | null;
}

function buildEnrichedEvents(
  events: TimelineEvent[],
  trace?: TimelineTrace,
): { items: EnrichedTimelineEvent[]; lanes: string[]; hasTemporal: boolean; domain: [number, number] } {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const traceMap = new Map<number, TimelineTraceEntry>();
  if (trace) {
    for (const entry of trace) {
      traceMap.set(entry.seq, entry);
    }
  }

  const lanes: string[] = [];
  let minT = Infinity;
  let maxT = -Infinity;
  let temporalCount = 0;

  const items: EnrichedTimelineEvent[] = sorted.map((ev, idx) => {
    if (!lanes.includes(ev.lane)) lanes.push(ev.lane);
    const tr = traceMap.get(ev.seq);
    const t = tr ? tr.t : null;
    const duration = tr && typeof tr.duration === 'number' ? tr.duration : null;
    if (t !== null) {
      temporalCount += 1;
      if (t < minT) minT = t;
      const endT = duration !== null ? t + duration : t;
      if (endT > maxT) maxT = endT;
    }
    return { ...ev, orderIndex: idx, t, duration };
  });

  const hasTemporal = temporalCount > 0 && Number.isFinite(minT) && Number.isFinite(maxT);
  const domain: [number, number] = hasTemporal
    ? [Math.min(0, minT), maxT === minT ? minT + 1 : maxT]
    : [0, Math.max(1, items.length - 1)];

  return { items, lanes, hasTemporal, domain };
}

function truncateLabel(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function statusStrokeVar(status: TimelineEvent['status'], active: boolean): string {
  if (active) return 'var(--inst-highlight)';
  if (status === 'fail') return 'var(--inst-fail)';
  if (status === 'warn') return 'var(--inst-warn)';
  if (status === 'ok') return 'var(--inst-ok)';
  return 'var(--inst-ink)';
}

interface TimelineTrackProps {
  items: EnrichedTimelineEvent[];
  lanes: string[];
  hasTemporal: boolean;
  domain: [number, number];
  variant: 'primary' | 'secondary';
  variantLabel: string;
  activeIndex: number;
  patternPrefix: string;
}

function TimelineTrack({
  items,
  lanes,
  hasTemporal,
  domain,
  variant,
  variantLabel,
  activeIndex,
  patternPrefix,
}: TimelineTrackProps) {
  const height = TOP_AXIS_H + lanes.length * LANE_ROW_H + BOTTOM_PAD;
  const plotLeft = LANE_COL_W;
  const plotRight = SVG_WIDTH - RIGHT_PAD;
  const scale = createLinearScale(domain, [plotLeft + 8, plotRight - 8]);
  const ticks = hasTemporal ? niceTicks(domain, 5) : items.map((_, i) => i);
  const dashAttr = variant === 'secondary' ? '3 3' : undefined;
  const hatchWarnId = `${patternPrefix}-hatch-warn`;
  const hatchFailId = `${patternPrefix}-hatch-fail`;

  return (
    <div className="inst-tl-block">
      <div className="inst-tl-variant">
        {variantLabel} · {hasTemporal ? 'TEMPORAL (MS)' : 'ORDINAL (#)'}
      </div>
      <svg
        className="inst-svg"
        viewBox={`0 0 ${SVG_WIDTH} ${height}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <pattern
            id={hatchWarnId}
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
              stroke="var(--inst-warn)"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id={hatchFailId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke="var(--inst-fail)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* Top axis line */}
        <line
          x1={plotLeft}
          y1={TOP_AXIS_H - 0.5}
          x2={plotRight}
          y2={TOP_AXIS_H - 0.5}
          stroke="var(--inst-rule)"
          strokeWidth="0.5"
        />

        {/* Ticks and vertical gridlines */}
        {ticks.map((tick, idx) => {
          // Avoid crowded ordinal ticks when many events exist
          if (!hasTemporal && ticks.length > 12 && idx % Math.ceil(ticks.length / 10) !== 0 && idx !== ticks.length - 1) {
            return null;
          }
          const x = Math.round(scale(tick)) + 0.5;
          const label = hasTemporal ? `${tick}ms` : `#${tick + 1}`;
          return (
            <g key={`tick-${tick}-${idx}`}>
              <line
                x1={x}
                y1={TOP_AXIS_H - 4}
                x2={x}
                y2={height - BOTTOM_PAD}
                stroke="var(--inst-rule-soft)"
                strokeWidth="0.5"
                strokeDasharray="3 3"
              />
              <text
                x={x}
                y={TOP_AXIS_H - 8}
                textAnchor="middle"
                className="inst-svg-muted"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Lanes */}
        {lanes.map((lane, laneIdx) => {
          const yTop = TOP_AXIS_H + laneIdx * LANE_ROW_H;
          const yMid = yTop + LANE_ROW_H / 2;
          return (
            <g key={lane}>
              <line
                x1={0}
                y1={yTop + LANE_ROW_H - 0.5}
                x2={plotRight}
                y2={yTop + LANE_ROW_H - 0.5}
                stroke="var(--inst-rule-soft)"
                strokeWidth="0.5"
              />
              <text
                x={4}
                y={yMid + 3}
                className="inst-svg-label"
              >
                {truncateLabel(lane, 16)}
              </text>
            </g>
          );
        })}

        {/* Events */}
        {items.map((ev, idx) => {
          const laneIdx = lanes.indexOf(ev.lane);
          const yMid = TOP_AXIS_H + laneIdx * LANE_ROW_H + LANE_ROW_H / 2;
          const active = variant === 'primary' && idx === activeIndex;
          const stroke = statusStrokeVar(ev.status, active);
          const xStart = hasTemporal && ev.t !== null ? scale(ev.t) : scale(idx);
          const hasBar = hasTemporal && ev.t !== null && ev.duration !== null;
          const barW = hasBar
            ? Math.max(2, scale((ev.t ?? 0) + (ev.duration ?? 0)) - xStart)
            : 0;
          const fill =
            ev.status === 'fail'
              ? `url(#${hatchFailId})`
              : ev.status === 'warn'
                ? `url(#${hatchWarnId})`
                : active
                  ? 'var(--inst-paper-sunk)'
                  : 'var(--inst-paper)';
          const statusSuffix =
            ev.status === 'fail' ? ' [FAIL]' : ev.status === 'warn' ? ' [WARN]' : '';
          const shortLabel = `${truncateLabel(ev.label, 14)}${statusSuffix}`;
          const labelNearRight = xStart > plotRight - 110;

          return (
            <g key={`ev-${ev.seq}-${idx}`}>
              {hasBar ? (
                <rect
                  x={Math.round(xStart) + 0.5}
                  y={Math.round(yMid - 7) + 0.5}
                  width={Math.round(barW)}
                  height={14}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={active ? 2 : 1}
                  strokeDasharray={dashAttr}
                />
              ) : (
                <polygon
                  points={`${xStart},${yMid - 6} ${xStart + 6},${yMid} ${xStart},${yMid + 6} ${xStart - 6},${yMid}`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={active ? 2 : 1}
                  strokeDasharray={dashAttr}
                />
              )}
              <text
                x={labelNearRight ? xStart - 8 : hasBar ? xStart + barW + 4 : xStart + 9}
                y={yMid + 3}
                textAnchor={labelNearRight ? 'end' : 'start'}
                className="inst-svg-muted"
              >
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Timeline({
  observed,
  compareObserved,
  trace,
  compareTrace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<TimelineObserved, TimelineTrace>) {
  const patternPrefix = useId().replace(/:/g, '');

  const primary = useMemo(
    () => buildEnrichedEvents(observed.events, trace),
    [observed.events, trace],
  );
  const secondary = useMemo(
    () => (compareObserved ? buildEnrichedEvents(compareObserved.events, compareTrace) : null),
    [compareObserved, compareTrace],
  );

  // Align temporal domain when both tracks have temporal traces
  const sharedDomain: [number, number] = useMemo(() => {
    if (secondary && primary.hasTemporal && secondary.hasTemporal) {
      return [
        Math.min(primary.domain[0], secondary.domain[0]),
        Math.max(primary.domain[1], secondary.domain[1]),
      ];
    }
    return primary.domain;
  }, [primary, secondary]);

  const stepper = useStepper(primary.items.length, 0);
  const active = primary.items[stepper.index];

  if (primary.items.length === 0) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
      />
    );
  }

  const announce = active
    ? `Event ${stepper.index + 1} of ${primary.items.length}: ${active.label} on lane ${active.lane} (${active.status})${active.t !== null ? ` at ${active.t.toFixed(1)} ms` : ''}${active.duration !== null ? `, duration ${active.duration.toFixed(1)} ms` : ''}.`
    : '';

  const controls = (
    <>
      <div className="inst-stepper" role="group" aria-label="Timeline step controls">
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.prev}
          disabled={stepper.index === 0}
          aria-label="Previous event"
        >
          Prev
        </button>
        <button
          type="button"
          className="inst-btn"
          onClick={stepper.next}
          disabled={stepper.index >= primary.items.length - 1}
          aria-label="Next event"
        >
          Next
        </button>
      </div>
      <span className="inst-step-counter">
        EVENT {stepper.index + 1} / {primary.items.length}
        {active ? ` · ${active.label}` : ''}
      </span>
    </>
  );

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={announce}
      controls={controls}
    >
      <div
        className="inst-tl-wrap"
        tabIndex={0}
        onKeyDown={stepper.onKeyDown}
        aria-label={`Timeline (${labels.primary}). Use arrow keys to step through events.`}
      >
        {secondary ? (
          <div className="inst-legend">
            <span className="inst-legend-item">
              <span className="inst-legend-swatch" aria-hidden="true" />
              {labels.primary}
            </span>
            <span className="inst-legend-item">
              <span className="inst-legend-swatch inst-legend-swatch-dashed" aria-hidden="true" />
              {labels.secondary ?? 'Control'}
            </span>
          </div>
        ) : null}

        <TimelineTrack
          items={primary.items}
          lanes={primary.lanes}
          hasTemporal={primary.hasTemporal}
          domain={sharedDomain}
          variant="primary"
          variantLabel={labels.primary}
          activeIndex={stepper.index}
          patternPrefix={`${patternPrefix}-p`}
        />

        {secondary ? (
          <TimelineTrack
            items={secondary.items}
            lanes={secondary.lanes}
            hasTemporal={secondary.hasTemporal}
            domain={secondary.hasTemporal && primary.hasTemporal ? sharedDomain : secondary.domain}
            variant="secondary"
            variantLabel={labels.secondary ?? 'Control'}
            activeIndex={-1}
            patternPrefix={`${patternPrefix}-s`}
          />
        ) : null}

        <table className="inst-sr">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Order</th>
              <th>Lane</th>
              <th>Event</th>
              <th>Status</th>
              <th>Start (ms)</th>
              <th>Duration (ms)</th>
            </tr>
          </thead>
          <tbody>
            {primary.items.map((ev) => (
              <tr key={`row-${ev.seq}`}>
                <td>{ev.orderIndex + 1}</td>
                <td>{ev.lane}</td>
                <td>{ev.label}</td>
                <td>{ev.status}</td>
                <td>{ev.t !== null ? ev.t.toFixed(1) : '—'}</td>
                <td>{ev.duration !== null ? ev.duration.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InstrumentFrame>
  );
}
