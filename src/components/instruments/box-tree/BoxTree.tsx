'use client';

import React, { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { InstrumentFrame } from '../InstrumentFrame';
import { markInstrumentLoaded } from '../loaded-flag';
import type { InstrumentProps } from '../types';
import {
  collectExpandableIds,
  diffBoxTrees,
  flattenVisibleTree,
  type BoxNodeDiff,
} from './diff';
import type { BoxNode, BoxSize, BoxTreeObserved, BoxTreeTrace } from './schema';

markInstrumentLoaded('box-tree');

export default function BoxTree({
  observed,
  compareObserved,
  trace,
  compareTrace,
  labels,
  caption,
  figureNumber,
  highlightColor,
}: InstrumentProps<BoxTreeObserved, BoxTreeTrace>) {
  const initialExpanded = useMemo(
    () => new Set<string>(collectExpandableIds(observed.root)),
    [observed.root],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpanded));
  const [focusedId, setFocusedId] = useState<string>(observed.root.id);
  const [announce, setAnnounce] = useState<string>('');
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const visibleItems = useMemo(
    () => flattenVisibleTree(observed.root, expanded),
    [observed.root, expanded],
  );

  const diffs = useMemo(
    () => diffBoxTrees(observed.root, compareObserved?.root, trace?.sizes, compareTrace?.sizes),
    [observed.root, compareObserved, trace, compareTrace],
  );

  const rootWidth = trace?.sizes[observed.root.id]?.width ?? 0;

  const focusNode = useCallback(
    (id: string) => {
      setFocusedId(id);
      const el = itemRefs.current.get(id);
      if (el) el.focus();
      const diff = diffs.get(id);
      if (diff && diff.summary.length > 0) {
        setAnnounce(`${id}: ${diff.summary.join('; ')}`);
      }
    },
    [diffs],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLLIElement>, nodeId: string) => {
      const idx = visibleItems.findIndex((item) => item.id === nodeId);
      if (idx === -1) return;
      const current = visibleItems[idx];

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          e.stopPropagation();
          const next = visibleItems[idx + 1];
          if (next) focusNode(next.id);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          e.stopPropagation();
          const prev = visibleItems[idx - 1];
          if (prev) focusNode(prev.id);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          e.stopPropagation();
          if (current.hasChildren) {
            if (!expanded.has(nodeId)) {
              toggleExpand(nodeId);
              setAnnounce(`Expanded ${current.node.label}`);
            } else if (current.node.children[0]) {
              focusNode(current.node.children[0].id);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          e.stopPropagation();
          if (current.hasChildren && expanded.has(nodeId)) {
            toggleExpand(nodeId);
            setAnnounce(`Collapsed ${current.node.label}`);
          } else if (current.parentId) {
            focusNode(current.parentId);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          e.stopPropagation();
          if (visibleItems[0]) focusNode(visibleItems[0].id);
          break;
        }
        case 'End': {
          e.preventDefault();
          e.stopPropagation();
          const last = visibleItems[visibleItems.length - 1];
          if (last) focusNode(last.id);
          break;
        }
        default:
          break;
      }
    },
    [visibleItems, expanded, focusNode, toggleExpand],
  );

  const renderNode = (node: BoxNode): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isFocused = focusedId === node.id;
    const diff: BoxNodeDiff | undefined = diffs.get(node.id);
    const changed = Boolean(diff && diff.summary.length > 0);
    const size: BoxSize | undefined = trace?.sizes[node.id];
    const barPct =
      size && rootWidth > 0 ? Math.max(2, Math.min(100, (size.width / rootWidth) * 100)) : 0;

    const changedFlags = new Set(diff?.flagChanges.map((fc) => fc.flag) ?? []);

    return (
      <li
        key={node.id}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isFocused}
        tabIndex={isFocused ? 0 : -1}
        className="inst-bt-item"
        ref={(el) => {
          if (el) itemRefs.current.set(node.id, el);
          else itemRefs.current.delete(node.id);
        }}
        onKeyDown={(e) => handleKeyDown(e, node.id)}
        onFocus={(e) => {
          e.stopPropagation();
          setFocusedId(node.id);
        }}
      >
        <div className="inst-bt-row" data-changed={changed ? 'true' : 'false'}>
          {hasChildren ? (
            <button
              type="button"
              className="inst-bt-toggle"
              tabIndex={-1}
              aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <span className="inst-bt-spacer" aria-hidden="true" />
          )}

          <span className="inst-bt-label">{node.label}</span>
          <span className="inst-bt-display">{node.display}</span>

          {node.flags.map((flag) => (
            <span
              key={flag}
              className="inst-bt-flag"
              data-diff={changedFlags.has(flag) ? 'changed' : 'same'}
            >
              {flag}
            </span>
          ))}

          {diff?.flagChanges
            .filter((fc) => fc.kind === 'removed')
            .map((fc) => (
              <span key={`rem-${fc.flag}`} className="inst-bt-flag" data-diff="changed">
                {fc.flag}: yes → no
              </span>
            ))}

          {size ? (
            <span className="inst-bt-size">
              {size.width.toFixed(1)} × {size.height.toFixed(1)} px
              {diff?.sizeChanged && diff.secondarySize
                ? ` (vs ${diff.secondarySize.width.toFixed(1)} × ${diff.secondarySize.height.toFixed(1)})`
                : ''}
            </span>
          ) : null}

          {size && rootWidth > 0 ? (
            <span className="inst-bt-bar-track" aria-hidden="true">
              <span className="inst-bt-bar-fill" style={{ width: `${barPct.toFixed(1)}%` }} />
            </span>
          ) : null}
        </div>

        {hasChildren && isExpanded ? (
          <ul role="group" className="inst-bt-group">
            {node.children.map((child) => renderNode(child))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <InstrumentFrame
      caption={caption}
      figureNumber={figureNumber}
      highlightColor={highlightColor}
      announce={announce}
    >
      {compareObserved ? (
        <div className="inst-legend" style={{ marginBottom: 'var(--space-s)' }}>
          <span className="inst-legend-item">
            <span className="inst-legend-swatch" aria-hidden="true" />
            {labels.primary}
          </span>
          <span className="inst-legend-item">
            <span className="inst-legend-swatch inst-legend-swatch-dashed" aria-hidden="true" />
            Compared against {labels.secondary ?? 'Control'}
          </span>
        </div>
      ) : null}

      <ul role="tree" className="inst-bt-tree" aria-label={`Layout box tree (${labels.primary})`}>
        {renderNode(observed.root)}
      </ul>
    </InstrumentFrame>
  );
}
