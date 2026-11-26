'use client';

import React, { useMemo } from 'react';
import { UI_STRINGS } from '@/lib/ui-strings';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import { useReducedMotion } from '../useReducedMotion';
import {
  buildStackTree,
  declaredAgreesWithHit,
  flattenDeclaredOrder,
  normalizeLayerRects,
  type StackTreeNode,
} from './build';
import type { LayerStackObserved, LayerStackTrace } from './schema';

markInstrumentLoaded('layer-stack');

const SVG_WIDTH = 640;
const PLATE_BASE_W = 240;
const PLATE_BASE_H = 52;
const LAYER_GAP = 42;
const TOP_PAD = 28;
const BOTTOM_PAD = 24;

function renderFlatTree(nodes: StackTreeNode[], hitId: string | null): React.ReactNode {
  return nodes.map((item) => {
    const isHit = hitId === item.node.id;
    const zText = `z-index: ${item.node.zIndex}${item.node.topLayer ? ' · top-layer' : ''}`;
    if (item.node.createsStackingContext || item.children.length > 0) {
      return (
        <div key={item.node.id} className="inst-ls-flat-ctx">
          <div className="inst-ls-flat-node" data-hit={isHit ? 'true' : 'false'}>
            <span>
              {item.node.label}
              {item.node.createsStackingContext ? ' [STACKING CONTEXT]' : ''}
            </span>
            <span>{zText}</span>
          </div>
          {item.children.length > 0 ? renderFlatTree(item.children, hitId) : null}
        </div>
      );
    }
    return (
      <div key={item.node.id} className="inst-ls-flat-node" data-hit={isHit ? 'true' : 'false'}>
        <span>{item.node.label}</span>
        <span>{zText}</span>
      </div>
    );
  });
}

function renderAccessibleTree(nodes: StackTreeNode[]): React.ReactNode {
  return (
    <ul>
      {nodes.map((item) => (
        <li key={item.node.id}>
          {item.node.label} (z-index: {item.node.zIndex}
          {item.node.createsStackingContext ? ', creates stacking context' : ''}
          {item.node.topLayer ? ', top layer' : ''})
          {item.children.length > 0 ? renderAccessibleTree(item.children) : null}
        </li>
      ))}
    </ul>
  );
}

export default function LayerStack({
  observed,
  compareObserved,
  trace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<LayerStackObserved, LayerStackTrace>) {
  const reducedMotion = useReducedMotion();

  const roots = useMemo(() => buildStackTree(observed.nodes), [observed.nodes]);
  const ordered = useMemo(() => flattenDeclaredOrder(roots), [roots]);
  const hitId = observed.probe?.hitId ?? null;
  const hitNode = useMemo(
    () => (hitId ? observed.nodes.find((n) => n.id === hitId) ?? null : null),
    [observed.nodes, hitId],
  );
  const agrees = useMemo(() => declaredAgreesWithHit(ordered, hitId), [ordered, hitId]);

  const normRects = useMemo(
    () => (trace ? normalizeLayerRects(trace.rects, PLATE_BASE_W, PLATE_BASE_H) : null),
    [trace],
  );

  const compareHitNode = useMemo(() => {
    const cid = compareObserved?.probe?.hitId;
    if (!cid || !compareObserved) return null;
    return compareObserved.nodes.find((n) => n.id === cid) ?? null;
  }, [compareObserved]);

  if (observed.nodes.length === 0) {
    return (
      <InstrumentFrame
        caption={caption}
        figureNumber={figureNumber}
        highlightColor={highlightColor}
        empty={UI_STRINGS.INSTRUMENTS.emptyObservation}
      />
    );
  }

  const hitSentence = hitNode
    ? `Your browser hit: ${hitNode.label} (z-index: ${hitNode.zIndex})`
    : hitId
      ? `Your browser hit: ${hitId}`
      : 'No probe hit recorded';

  const svgHeight = TOP_PAD + ordered.length * LAYER_GAP + PLATE_BASE_H + BOTTOM_PAD;
  const skewX = 36;
  const leftOrigin = 56;

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={`${hitSentence}.${!agrees ? ` ${UI_STRINGS.INSTRUMENTS.layerStackDisagree}.` : ''}`}
    >
      <div className="inst-ls-summary">
        <span>
          {UI_STRINGS.INSTRUMENTS.layerStackDeclaredLabel.toUpperCase()} ({labels.primary}) ·{' '}
          <span className="inst-ls-hit">{hitSentence}</span>
        </span>
        {!agrees ? (
          <span className="inst-ls-disagree">{UI_STRINGS.INSTRUMENTS.layerStackDisagree}</span>
        ) : null}
      </div>

      {compareHitNode ? (
        <div className="inst-legend" style={{ marginBottom: 'var(--space-s)' }}>
          <span className="inst-legend-item">
            <span className="inst-legend-swatch" aria-hidden="true" />
            {labels.primary}: hit {hitNode?.label ?? 'none'}
          </span>
          <span className="inst-legend-item">
            <span className="inst-legend-swatch inst-legend-swatch-dashed" aria-hidden="true" />
            {labels.secondary ?? 'Control'}: hit {compareHitNode.label} (z-index: {compareHitNode.zIndex})
          </span>
        </div>
      ) : null}

      {reducedMotion ? (
        <div className="inst-ls-flat">{renderFlatTree(roots, hitId)}</div>
      ) : (
        <svg
          className="inst-svg"
          viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
          aria-hidden="true"
          focusable="false"
        >
          {/* Paint order arrow on the left */}
          <line
            x1="20.5"
            y1={svgHeight - BOTTOM_PAD}
            x2="20.5"
            y2={TOP_PAD}
            stroke="var(--inst-rule-soft)"
            strokeWidth="0.5"
          />
          <polygon
            points={`20.5,${TOP_PAD - 5} 17.5,${TOP_PAD + 2} 23.5,${TOP_PAD + 2}`}
            fill="var(--inst-ink-muted)"
          />
          <text x="6" y={TOP_PAD - 10} className="inst-svg-muted">
            FRONT
          </text>
          <text x="6" y={svgHeight - 8} className="inst-svg-muted">
            BACK
          </text>

          {/* Exploded axonometric plates (index 0 at bottom, topmost at top) */}
          {ordered.map((item, paintIdx) => {
            const revIdx = ordered.length - 1 - paintIdx;
            const rect = normRects?.[item.node.id];
            const plateW = rect ? Math.max(90, rect.width) : PLATE_BASE_W;
            const plateH = rect ? Math.max(24, rect.height) : PLATE_BASE_H;
            const offsetX = leftOrigin + item.depth * 24 + (rect ? rect.x * 0.35 : 0);
            const yBase = TOP_PAD + revIdx * LAYER_GAP;
            const isHit = item.node.id === hitId;
            const isContext = item.node.createsStackingContext;
            const stroke = isHit ? 'var(--inst-highlight)' : 'var(--inst-ink)';
            const strokeWidth = isHit ? 2 : 1;

            const p1 = `${(offsetX + skewX).toFixed(1)},${yBase.toFixed(1)}`;
            const p2 = `${(offsetX + skewX + plateW).toFixed(1)},${yBase.toFixed(1)}`;
            const p3 = `${(offsetX + plateW).toFixed(1)},${(yBase + plateH).toFixed(1)}`;
            const p4 = `${offsetX.toFixed(1)},${(yBase + plateH).toFixed(1)}`;

            const calloutX = offsetX + skewX + plateW + 18;
            const calloutY = yBase + plateH * 0.45;

            return (
              <g key={item.node.id}>
                <polygon
                  points={`${p1} ${p2} ${p3} ${p4}`}
                  fill={isHit ? 'var(--inst-paper-sunk)' : 'var(--inst-paper)'}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isContext && !isHit ? '3 3' : undefined}
                />
                {/* Callout leader line */}
                <line
                  x1={(offsetX + skewX + plateW).toFixed(1)}
                  y1={calloutY.toFixed(1)}
                  x2={(calloutX - 4).toFixed(1)}
                  y2={calloutY.toFixed(1)}
                  stroke={isHit ? 'var(--inst-highlight)' : 'var(--inst-rule-soft)'}
                  strokeWidth="0.5"
                />
                <text
                  x={calloutX}
                  y={(calloutY + 3).toFixed(1)}
                  className={isHit ? 'inst-svg-label' : 'inst-svg-muted'}
                  style={isHit ? { fill: 'var(--inst-highlight)' } : undefined}
                >
                  {`${item.node.label} · z:${item.node.zIndex}${isContext ? ' [CTX]' : ''}${item.node.topLayer ? ' [TOP]' : ''}${isHit ? ' ← HIT' : ''}`}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <div className="inst-sr">
        <p>{hitSentence}.</p>
        {!agrees ? <p>{UI_STRINGS.INSTRUMENTS.layerStackDisagree}.</p> : null}
        {renderAccessibleTree(roots)}
      </div>
    </InstrumentFrame>
  );
}
