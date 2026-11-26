'use client';

import React, { useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import { computeFrameStats, describeMeasured } from './build';
import type { FrameBudgetObserved, FrameBudgetTrace } from './schema';

markInstrumentLoaded('frame-budget');

const SVG_WIDTH = 640;
const BAR_LABEL_W = 148;
const BAR_RIGHT_PAD = 96;
const BAR_ROW_H = 34;

export default function FrameBudget({
  measured,
  trace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<FrameBudgetObserved, FrameBudgetTrace>) {
  const summary = useMemo(
    () => (measured ? describeMeasured(measured, labels) : null),
    [measured, labels],
  );

  const frameStats = useMemo(
    () => (trace ? computeFrameStats(trace.frames) : null),
    [trace],
  );

  if (!summary && !trace) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
      />
    );
  }

  const barPlotW = SVG_WIDTH - BAR_LABEL_W - BAR_RIGHT_PAD;
  const barSvgH = 24 + 2 * BAR_ROW_H;

  // Frame chart layout when trace has >= 10 frames
  const frameChartH = 156;
  const framePlotLeft = 44;
  const framePlotRight = SVG_WIDTH - 20;
  const framePlotTop = 26;
  const framePlotBottom = 122;
  const framePlotH = framePlotBottom - framePlotTop;
  const framePlotW = framePlotRight - framePlotLeft;

  const maxFrameMs = frameStats?.sufficient
    ? Math.max(
        (frameStats.refreshMs ?? 16) * 2,
        ...frameStats.intervals.map((i) => i.duration),
      )
    : 1;

  const traceStart = trace && trace.frames.length > 0 ? trace.frames[0].start : 0;
  const traceEnd =
    trace && trace.frames.length > 0
      ? Math.max(traceStart + 1, trace.frames[trace.frames.length - 1].end)
      : 1;

  const mapTimeX = (t: number) =>
    framePlotLeft + ((t - traceStart) / (traceEnd - traceStart)) * framePlotW;

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={summary?.announce}
    >
      <div className="inst-fb-wrap">
        {summary ? (
          <div>
            <p className="inst-fb-headline">{summary.headline}</p>
            <p className="inst-fb-meta">{summary.meta}</p>

            <svg
              className="inst-svg"
              viewBox={`0 0 ${SVG_WIDTH} ${barSvgH}`}
              role="img"
              aria-label={summary.announce}
              style={{ marginTop: 'var(--space-xs)' }}
            >
              {summary.bars.map((bar, idx) => {
                const y = 12 + idx * BAR_ROW_H;
                const w = Math.max(4, Math.round((bar.pct / 100) * barPlotW));
                const stroke = bar.slower ? 'var(--inst-highlight)' : 'var(--inst-ink)';
                const dash = bar.role === 'secondary' ? '3 3' : undefined;
                const valText =
                  bar.median >= 10 ? `${Math.round(bar.median)} MS` : `${bar.median.toFixed(1)} MS`;

                return (
                  <g key={bar.role}>
                    <text x={0} y={y + 14} className="inst-svg-label">
                      {bar.label.length > 18 ? `${bar.label.slice(0, 17)}…` : bar.label}
                    </text>
                    <rect
                      x={BAR_LABEL_W + 0.5}
                      y={y + 2.5}
                      width={w}
                      height={16}
                      fill={bar.slower ? 'var(--inst-paper-sunk)' : 'var(--inst-paper)'}
                      stroke={stroke}
                      strokeWidth={bar.slower ? 2 : 1}
                      strokeDasharray={dash}
                    />
                    <text
                      x={BAR_LABEL_W + w + 8}
                      y={y + 14}
                      className="inst-svg-label"
                      style={bar.slower ? { fill: 'var(--inst-highlight)' } : undefined}
                    >
                      {valText}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : null}

        {trace && frameStats ? (
          !frameStats.sufficient ? (
            <div className="inst-state inst-state-empty" role="status">
              <span className="inst-state-tag">FRAMES</span>
              <p className="inst-state-msg">
                {UI_STRINGS.INSTRUMENTS.frameBudgetNotEnoughFrames} ({trace.frames.length} recorded)
              </p>
            </div>
          ) : (
            <div>
              <p className="inst-fb-meta">
                YOUR DISPLAY: ~{frameStats.refreshMs} MS PER FRAME · {frameStats.droppedCount} DROPPED
              </p>
              <svg
                className="inst-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${frameChartH}`}
                role="img"
                aria-label={`Frame intervals: median ${frameStats.refreshMs} ms per frame, ${frameStats.droppedCount} dropped frames out of ${frameStats.intervals.length}.`}
                style={{ marginTop: 'var(--space-xs)' }}
              >
                {/* Baseline */}
                <line
                  x1={framePlotLeft}
                  y1={framePlotBottom + 0.5}
                  x2={framePlotRight}
                  y2={framePlotBottom + 0.5}
                  stroke="var(--inst-rule)"
                  strokeWidth="0.5"
                />

                {/* Vertical frame interval bars */}
                {frameStats.intervals.map((item) => {
                  const slotW = framePlotW / frameStats.intervals.length;
                  const barW = Math.max(2, slotW - 2);
                  const x = framePlotLeft + item.index * slotW + 1;
                  const h = Math.max(2, (item.duration / maxFrameMs) * framePlotH);
                  const y = framePlotBottom - h;
                  return (
                    <rect
                      key={`f-${item.index}`}
                      x={Math.round(x) + 0.5}
                      y={Math.round(y) + 0.5}
                      width={Math.max(2, Math.round(barW))}
                      height={Math.round(h)}
                      fill={item.dropped ? 'var(--inst-paper-sunk)' : 'var(--inst-paper)'}
                      stroke={item.dropped ? 'var(--inst-highlight)' : 'var(--inst-ink)'}
                      strokeWidth={item.dropped ? 1.5 : 1}
                    />
                  );
                })}

                {/* Refresh reference line (drawn on top, label right-aligned to avoid tall drop bars) */}
                {frameStats.refreshMs !== null ? (
                  <g>
                    {(() => {
                      const yRef =
                        Math.round(
                          framePlotBottom - (frameStats.refreshMs / maxFrameMs) * framePlotH,
                        ) + 0.5;
                      return (
                        <>
                          <line
                            x1={framePlotLeft}
                            y1={yRef}
                            x2={framePlotRight}
                            y2={yRef}
                            stroke="var(--inst-rule)"
                            strokeWidth="0.5"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={framePlotRight - 4}
                            y={yRef - 5}
                            textAnchor="end"
                            className="inst-svg-muted"
                          >
                            {`YOUR DISPLAY: ~${frameStats.refreshMs} MS PER FRAME`}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                ) : null}

                {/* Long tasks band */}
                {trace.longTasks.map((lt, idx) => {
                  const x1 = Math.max(framePlotLeft, mapTimeX(lt.start));
                  const x2 = Math.min(framePlotRight, mapTimeX(lt.start + lt.duration));
                  const w = Math.max(4, x2 - x1);
                  return (
                    <g key={`lt-${idx}`}>
                      <rect
                        x={Math.round(x1) + 0.5}
                        y={framePlotBottom + 6.5}
                        width={Math.round(w)}
                        height={12}
                        fill="var(--inst-paper-sunk)"
                        stroke="var(--inst-fail)"
                        strokeWidth="1"
                      />
                      <text x={x1 + 3} y={framePlotBottom + 16} className="inst-svg-muted">
                        {`LONG TASK ${Math.round(lt.duration)}MS`}
                      </text>
                    </g>
                  );
                })}

                {/* Marks */}
                {trace.marks.map((mark, idx) => {
                  const x = Math.round(
                    Math.max(framePlotLeft, Math.min(framePlotRight, mapTimeX(mark.t))),
                  ) + 0.5;
                  return (
                    <g key={`m-${idx}`}>
                      <line
                        x1={x}
                        y1={framePlotTop - 6}
                        x2={x}
                        y2={framePlotBottom}
                        stroke="var(--inst-highlight)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text x={x + 3} y={framePlotTop - 10} className="inst-svg-label">
                        {mark.label}
                      </text>
                    </g>
                  );
                })}

                {/* Y-axis max label */}
                <text x={0} y={framePlotTop + 6} className="inst-svg-muted">
                  {`${Math.round(maxFrameMs)}MS`}
                </text>
                <text x={0} y={framePlotBottom} className="inst-svg-muted">
                  0MS
                </text>
              </svg>
            </div>
          )
        ) : null}
      </div>
    </InstrumentFrame>
  );
}
