'use client';

import React, { useMemo, useState } from 'react';
import { Readout } from '@/components/ui/Instrument/Readout';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import {
  diffJson,
  flattenJsonLeaves,
  formatJsonCell,
  shouldUseReadoutMode,
} from './diff';
import type { DiffObserved } from './schema';

markInstrumentLoaded('diff-view');

const DIFF_ONLY_THRESHOLD = 12;

export default function DiffView({
  observed,
  compareObserved,
  labels,
  caption,
  figureNumber,
  highlight,
  highlightColor,
}: InstrumentProps<DiffObserved>) {
  const hasCompare = compareObserved !== undefined;

  const entries = useMemo(
    () => (hasCompare ? diffJson(observed, compareObserved) : flattenJsonLeaves(observed)),
    [hasCompare, observed, compareObserved],
  );

  const [onlyDiffs, setOnlyDiffs] = useState<boolean>(
    () => hasCompare && entries.length > DIFF_ONLY_THRESHOLD,
  );

  const highlightSet = useMemo(() => new Set(highlight ?? []), [highlight]);
  const useReadouts = useMemo(() => shouldUseReadoutMode(entries), [entries]);

  const diffCount = useMemo(
    () => entries.filter((e) => e.kind !== 'same').length,
    [entries],
  );

  const visibleEntries = useMemo(
    () => (hasCompare && onlyDiffs ? entries.filter((e) => e.kind !== 'same') : entries),
    [hasCompare, onlyDiffs, entries],
  );

  const announce = hasCompare
    ? `${diffCount} difference${diffCount === 1 ? '' : 's'} out of ${entries.length} field${entries.length === 1 ? '' : 's'}.`
    : `${entries.length} observed field${entries.length === 1 ? '' : 's'}.`;

  if (useReadouts) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        announce={announce}
      >
        <div className="inst-diff-readouts">
          {entries.map((entry) => (
            <div key={entry.path} className="inst-diff-readout-group">
              <span className="inst-diff-readout-path">
                {entry.path}
                {entry.kind !== 'same' ? ' ≠' : ''}
              </span>
              <div className="inst-diff-readout-pair">
                {entry.a !== undefined ? (
                  <Readout
                    label={`${entry.path} (${labels.primary})`}
                    value={entry.a as number}
                    tone={entry.kind !== 'same' ? 'ok' : 'normal'}
                  />
                ) : null}
                {hasCompare && entry.b !== undefined ? (
                  <Readout
                    label={`${entry.path} (${labels.secondary ?? 'Control'})`}
                    value={entry.b as number}
                    tone="normal"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </InstrumentFrame>
    );
  }

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={announce}
    >
      {hasCompare ? (
        <div className="inst-diff-toolbar">
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
          <label className="inst-diff-toggle">
            <input
              type="checkbox"
              checked={onlyDiffs}
              onChange={(e) => setOnlyDiffs(e.target.checked)}
            />
            <span>Show only differences ({diffCount})</span>
          </label>
        </div>
      ) : null}

      <table className="inst-diff-table">
        <caption className="inst-sr">{caption}</caption>
        <thead>
          <tr>
            <th>Path</th>
            <th>{labels.primary}</th>
            {hasCompare ? <th>{labels.secondary ?? 'Control'}</th> : null}
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map((entry) => {
            const changed = entry.kind !== 'same';
            const marker =
              entry.kind === 'changed'
                ? '≠'
                : entry.kind === 'added'
                  ? '+'
                  : entry.kind === 'removed'
                    ? '−'
                    : '=';
            return (
              <tr
                key={entry.path}
                className="inst-diff-row"
                data-changed={changed ? 'true' : 'false'}
                data-highlighted={highlightSet.has(entry.path) ? 'true' : 'false'}
              >
                <td>
                  {hasCompare ? (
                    <span className="inst-diff-marker" aria-label={entry.kind}>
                      {marker}
                    </span>
                  ) : null}
                  {entry.path}
                </td>
                <td>{formatJsonCell(entry.a)}</td>
                {hasCompare ? <td>{formatJsonCell(entry.b)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </InstrumentFrame>
  );
}
