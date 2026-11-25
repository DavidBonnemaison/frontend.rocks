'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import {
  DOMAIN_VALUES,
  MATURITY_VALUES,
  type ConceptFrontmatter,
  type Domain,
  type MaturityStatus,
} from '@/lib/schemas';
import { formatDomainLabel, formatMaturityLabel, UI_STRINGS } from '@/lib/ui-strings';
import { getExploredConcepts, subscribeProgress } from '@/lib/progress';
import './KnowledgeGraph.css';

export interface GraphNodeData {
  id: string;
  title: string;
  domain: Domain;
  maturity_status: MaturityStatus | null;
  summary_tldr: string;
  relations: ConceptFrontmatter['relations'];
}

interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  depth: number;
}

interface GraphEdge {
  key: string;
  from: PositionedNode;
  to: PositionedNode;
  type: ConceptFrontmatter['relations'][number]['type'];
  note: string;
}

const NODE_WIDTH = 228;
const NODE_HEIGHT = 68;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;

const DOMAIN_COLORS: Record<Domain, string> = {
  'rendering-pipeline': '#38bdf8',
  'css-layout': '#a78bfa',
  'js-runtime': '#f59e0b',
  'dom-events': '#34d399',
  'network-perf': '#fb7185',
  'state-architecture': '#60a5fa',
  'software-architecture': '#c084fc',
  'web-apis': '#2dd4bf',
  'security-a11y': '#f472b6',
  'framework-internals': '#818cf8',
  'testing-verification': '#fb923c',
};

const EDGE_STYLES: Record<
  ConceptFrontmatter['relations'][number]['type'],
  { color: string; dasharray?: string; label: string }
> = {
  requires: {
    color: '#38bdf8',
    dasharray: undefined,
    label: UI_STRINGS.relations.requires,
  },
  under_the_hood: {
    color: '#a78bfa',
    dasharray: '6 4',
    label: UI_STRINGS.relations.underTheHood,
  },
  replaces: {
    color: '#f87171',
    dasharray: '2 4',
    label: UI_STRINGS.relations.replaces,
  },
  contrasts_with: {
    color: '#94a3b8',
    dasharray: '10 4 2 4',
    label: UI_STRINGS.relations.oftenConfusedWith,
  },
};

function computeLayeredLayout(nodes: GraphNodeData[]): PositionedNode[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const depthMemo = new Map<string, number>();

  function getDepth(id: string, visited = new Set<string>()): number {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = map.get(id);
    if (!node) return 0;
    const reqs = node.relations.filter((r) => r.type === 'requires' && map.has(r.target_id));
    const d = reqs.length === 0 ? 0 : 1 + Math.max(...reqs.map((r) => getDepth(r.target_id, visited)));
    depthMemo.set(id, d);
    return d;
  }

  for (const n of nodes) getDepth(n.id);

  const layers = new Map<number, GraphNodeData[]>();
  for (const n of nodes) {
    const d = depthMemo.get(n.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(n);
  }

  const domainOrder = new Map(DOMAIN_VALUES.map((d, i) => [d, i]));
  const colWidth = 292;
  const rowHeight = 92;
  const positioned: PositionedNode[] = [];

  const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const layerIdx of sortedLayers) {
    const group = layers.get(layerIdx)!.slice().sort((a, b) => {
      const da = domainOrder.get(a.domain) ?? 99;
      const db = domainOrder.get(b.domain) ?? 99;
      if (da !== db) return da - db;
      return a.title.localeCompare(b.title);
    });
    group.forEach((node, rowIdx) => {
      positioned.push({
        ...node,
        depth: layerIdx,
        x: 140 + layerIdx * colWidth,
        y: 64 + rowIdx * rowHeight,
      });
    });
  }

  return positioned;
}

function getEdgeEndpoint(from: PositionedNode, to: PositionedNode): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const hw = NODE_WIDTH / 2 + 3;
  const hh = NODE_HEIGHT / 2 + 3;
  const scale = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Infinity,
    dy !== 0 ? hh / Math.abs(dy) : Infinity
  );
  return {
    x: to.x - dx * scale,
    y: to.y - dy * scale,
  };
}

export function KnowledgeGraph({ nodes }: { nodes: GraphNodeData[] }) {
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all');
  const [maturityFilter, setMaturityFilter] = useState<MaturityStatus | 'pattern' | 'all'>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'explored' | 'remaining'>('all');
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [pinnedEdgeKey, setPinnedEdgeKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'tree' | 'domains'>('graph');
  const [hasManualViewOverride, setHasManualViewOverride] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasManualZoomRef = useRef(false);
  const dragStateRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0 });

  useEffect(() => {
    setExploredIds(getExploredConcepts());
    setProgressHydrated(true);
    return subscribeProgress((next) => {
      setExploredIds(next);
    });
  }, []);

  const exploredSet = useMemo(() => new Set(exploredIds), [exploredIds]);

  const exploredCountInGraph = useMemo(
    () => nodes.filter((n) => exploredSet.has(n.id)).length,
    [nodes, exploredSet]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!hasManualViewOverride) {
        setViewMode(mobile ? 'tree' : 'graph');
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [hasManualViewOverride]);

  const effectiveViewMode: 'graph' | 'tree' | 'domains' = isMobile
    ? viewMode === 'graph'
      ? 'tree'
      : viewMode
    : viewMode === 'domains'
      ? 'graph'
      : viewMode;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || effectiveViewMode !== 'graph') return;

    const handleWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      hasManualZoomRef.current = true;
      const rect = el.getBoundingClientRect();
      const cursorX = ev.clientX - rect.left;
      const cursorY = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;

      setZoom((prevZoom) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(prevZoom * factor).toFixed(3)));
        const ratio = nextZoom / prevZoom;
        setPan((prevPan) => ({
          x: cursorX - (cursorX - prevPan.x) * ratio,
          y: cursorY - (cursorY - prevPan.y) * ratio,
        }));
        return nextZoom;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [effectiveViewMode]);

  const filteredNodes = useMemo(
    () =>
      nodes.filter((n) => {
        if (domainFilter !== 'all' && n.domain !== domainFilter) return false;
        if (maturityFilter === 'pattern' && n.maturity_status !== null) return false;
        if (
          maturityFilter !== 'all' &&
          maturityFilter !== 'pattern' &&
          n.maturity_status !== maturityFilter
        ) {
          return false;
        }
        if (progressFilter === 'explored' && !exploredSet.has(n.id)) return false;
        if (progressFilter === 'remaining' && exploredSet.has(n.id)) return false;
        return true;
      }),
    [nodes, domainFilter, maturityFilter, progressFilter, exploredSet]
  );

  const positioned = useMemo(() => computeLayeredLayout(filteredNodes), [filteredNodes]);
  const posMap = useMemo(() => new Map(positioned.map((p) => [p.id, p])), [positioned]);
  const allNodesMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const edges = useMemo<GraphEdge[]>(() => {
    const list: GraphEdge[] = [];
    for (const n of positioned) {
      for (const rel of n.relations) {
        const target = posMap.get(rel.target_id);
        if (target) {
          list.push({
            key: `${n.id}::${target.id}::${rel.type}`,
            from: n,
            to: target,
            type: rel.type,
            note: rel.note,
          });
        }
      }
    }
    list.sort((a, b) => {
      const aAdj = Math.abs(a.from.depth - a.to.depth) === 1 ? 0 : 1;
      const bAdj = Math.abs(b.from.depth - b.to.depth) === 1 ? 0 : 1;
      return aAdj - bAdj;
    });
    return list;
  }, [positioned, posMap]);

  const activeEdgeKey = hoveredEdgeKey ?? pinnedEdgeKey;
  const activeId = activeEdgeKey ? null : (hoveredId ?? pinnedId);

  const activeEdge = useMemo(
    () => (activeEdgeKey ? edges.find((e) => e.key === activeEdgeKey) ?? null : null),
    [activeEdgeKey, edges]
  );

  const isEdgeConnectedToActiveNode = useCallback(
    (e: GraphEdge, nodeId: string) =>
      e.from.id === nodeId || (e.to.id === nodeId && e.type === 'requires'),
    []
  );

  const highlightedSet = useMemo(() => {
    if (activeEdge) {
      return new Set<string>([activeEdge.from.id, activeEdge.to.id]);
    }
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const e of edges) {
      if (isEdgeConnectedToActiveNode(e, activeId)) {
        set.add(e.from.id);
        set.add(e.to.id);
      }
    }
    return set;
  }, [activeId, activeEdge, edges, isEdgeConnectedToActiveNode]);

  const activeNode = !activeEdge && activeId ? posMap.get(activeId) ?? null : null;

  const layersForTree = useMemo(() => {
    const grouped = new Map<number, PositionedNode[]>();
    for (const node of positioned) {
      if (!grouped.has(node.depth)) grouped.set(node.depth, []);
      grouped.get(node.depth)!.push(node);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [positioned]);

  const domainGroups = useMemo(() => {
    const grouped = new Map<Domain, PositionedNode[]>();
    for (const d of DOMAIN_VALUES) {
      grouped.set(d, []);
    }
    for (const node of positioned) {
      grouped.get(node.domain)?.push(node);
    }
    return DOMAIN_VALUES.map((domain) => ({
      domain,
      label: formatDomainLabel(domain),
      color: DOMAIN_COLORS[domain],
      nodes: (grouped.get(domain) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [positioned]);

  const svgWidth = Math.max(
    820,
    (Math.max(0, ...positioned.map((p) => p.x)) || 0) + NODE_WIDTH / 2 + 40
  );
  const svgHeight = Math.max(
    420,
    (Math.max(0, ...positioned.map((p) => p.y)) || 0) + NODE_HEIGHT / 2 + 40
  );

  const getFitZoom = useCallback(() => {
    const el = viewportRef.current;
    if (!el || svgWidth <= 0) return 1;
    const available = Math.max(200, el.clientWidth - 24);
    return Math.min(1, Math.max(MIN_ZOOM, +(available / svgWidth).toFixed(3)));
  }, [svgWidth]);

  useEffect(() => {
    if (effectiveViewMode !== 'graph' || hasManualZoomRef.current) return;
    setZoom(getFitZoom());
    setPan({ x: 0, y: 0 });
  }, [effectiveViewMode, getFitZoom]);

  const togglePinNode = (id: string) => {
    setPinnedEdgeKey(null);
    setPinnedId((prev) => (prev === id ? null : id));
  };

  const pinEdge = (key: string) => {
    setPinnedId(null);
    setPinnedEdgeKey(key);
  };

  const toggleViewMode = (mode: 'graph' | 'tree' | 'domains') => {
    setHasManualViewOverride(true);
    setViewMode(mode);
  };

  const handleZoomIn = () => {
    hasManualZoomRef.current = true;
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  };

  const handleZoomOut = () => {
    hasManualZoomRef.current = true;
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  };

  const handleResetView = () => {
    hasManualZoomRef.current = false;
    setZoom(getFitZoom());
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    dragStateRef.current = {
      active: true,
      moved: false,
      startX: ev.clientX,
      startY: ev.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const handlePointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      setIsDragging(true);
    }
    if (drag.moved) {
      setPan({ x: drag.origPanX + dx, y: drag.origPanY + dy });
    }
  };

  const handlePointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const wasMoved = drag.moved;
    drag.active = false;
    drag.moved = false;
    setIsDragging(false);

    if (!wasMoved) {
      const target = ev.target as HTMLElement | null;
      if (target && !target.closest('[data-graph-interactive="true"]')) {
        setPinnedId(null);
        setPinnedEdgeKey(null);
      }
    }
  };

  return (
    <div className="graph-root">
      <div className="graph-toolbar">
        <div className="graph-filters">
          <label className="graph-filter-label">
            <span>{UI_STRINGS.graph.domainLabel}</span>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value as Domain | 'all')}
              className="sim-select"
            >
              <option value="all">
                {UI_STRINGS.graph.allOption} ({nodes.length})
              </option>
              {DOMAIN_VALUES.map((d) => (
                <option key={d} value={d}>
                  {formatDomainLabel(d)}
                </option>
              ))}
            </select>
          </label>

          <label className="graph-filter-label">
            <span>{UI_STRINGS.graph.maturityLabel}</span>
            <select
              value={maturityFilter}
              onChange={(e) =>
                setMaturityFilter(e.target.value as MaturityStatus | 'pattern' | 'all')
              }
              className="sim-select"
            >
              <option value="all">{UI_STRINGS.graph.allOption}</option>
              {MATURITY_VALUES.map((m) => (
                <option key={m} value={m}>
                  {formatMaturityLabel(m)}
                </option>
              ))}
              <option value="pattern">Pattern (no platform feature)</option>
            </select>
          </label>

          <label className="graph-filter-label">
            <span>Progress</span>
            <select
              value={progressFilter}
              onChange={(e) =>
                setProgressFilter(e.target.value as 'all' | 'explored' | 'remaining')
              }
              className="sim-select"
              data-testid="graph-progress-filter"
            >
              <option value="all">{UI_STRINGS.graph.allOption}</option>
              <option value="explored">
                Explored{progressHydrated ? ` (${exploredCountInGraph})` : ''}
              </option>
              <option value="remaining">
                Remaining{progressHydrated ? ` (${nodes.length - exploredCountInGraph})` : ''}
              </option>
            </select>
          </label>
        </div>

        <div className="graph-toolbar-actions">
          <div className="segmented" role="group" aria-label="Graph display mode">
            {isMobile ? (
              <>
                <button
                  type="button"
                  className={`seg-btn ${effectiveViewMode === 'tree' ? 'active' : ''}`}
                  onClick={() => toggleViewMode('tree')}
                  data-testid="graph-mode-tree"
                >
                  {UI_STRINGS.graph.viewTree}
                </button>
                <button
                  type="button"
                  className={`seg-btn ${effectiveViewMode === 'domains' ? 'active' : ''}`}
                  onClick={() => toggleViewMode('domains')}
                  data-testid="graph-mode-domains"
                >
                  {UI_STRINGS.graph.viewDomainGroups}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`seg-btn ${effectiveViewMode === 'graph' ? 'active' : ''}`}
                  onClick={() => toggleViewMode('graph')}
                  data-testid="graph-mode-svg"
                >
                  {UI_STRINGS.graph.viewGraph}
                </button>
                <button
                  type="button"
                  className={`seg-btn ${effectiveViewMode === 'tree' ? 'active' : ''}`}
                  onClick={() => toggleViewMode('tree')}
                  data-testid="graph-mode-tree"
                >
                  {UI_STRINGS.graph.viewTree}
                </button>
              </>
            )}
          </div>

          <Link href="/index-list" className="lab-btn inline-flex items-center gap-1" style={{ textDecoration: 'none' }}>
            <span>{UI_STRINGS.graph.indexLink}</span>
            <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {effectiveViewMode === 'graph' ? (
        <div className="graph-canvas-wrap">
          <div
            className="graph-zoom-controls"
            role="group"
            aria-label="Graph zoom controls"
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="graph-zoom-btn"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
              data-testid="graph-zoom-out"
            >
              -
            </button>
            <span className="graph-zoom-level" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="graph-zoom-btn"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
              data-testid="graph-zoom-in"
            >
              +
            </button>
            <button
              type="button"
              className="graph-zoom-btn"
              onClick={handleResetView}
              aria-label="Reset zoom and pan"
              title="Reset zoom and pan"
              data-testid="graph-zoom-reset"
            >
              Reset
            </button>
          </div>

          <div
            ref={viewportRef}
            className={`graph-viewport${isDragging ? ' is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="graph-svg-stage"
              style={{
                width: svgWidth,
                height: svgHeight,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                role="img"
                aria-label="Directed frontend concepts knowledge graph"
                style={{ display: 'block' }}
              >
                <defs>
                  {Object.entries(EDGE_STYLES).map(([type, style]) => (
                    <marker
                      key={type}
                      id={`arrow-${type}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill={style.color} />
                    </marker>
                  ))}
                </defs>

                {edges.map((e) => {
                  const style = EDGE_STYLES[e.type];
                  const isSelectedEdge = activeEdgeKey === e.key;
                  const isConnected = activeId ? isEdgeConnectedToActiveNode(e, activeId) : false;
                  const hasFocus = activeEdge !== null || activeId !== null;
                  const edgeOpacity = isSelectedEdge
                    ? 1
                    : isConnected
                      ? 1
                      : hasFocus
                        ? 0.04
                        : 0.06;
                  const edgeWidth = isSelectedEdge ? 3.2 : isConnected ? 2.2 : 1.2;

                  const end = getEdgeEndpoint(e.from, e.to);
                  const dx = end.x - e.from.x;
                  const dy = end.y - e.from.y;
                  const isHoriz = Math.abs(dy) < 4;
                  const isVert = Math.abs(dx) < 4;
                  const mx = (e.from.x + end.x) / 2;
                  const my = (e.from.y + end.y) / 2;
                  const pathD = isHoriz
                    ? `M ${e.from.x} ${e.from.y} Q ${mx} ${my - 10} ${end.x} ${end.y}`
                    : isVert
                      ? `M ${e.from.x} ${e.from.y} Q ${mx + 10} ${my} ${end.x} ${end.y}`
                      : `M ${e.from.x} ${e.from.y} L ${end.x} ${end.y}`;

                  return (
                    <g key={e.key} data-graph-interactive="true">
                      <path
                        d={pathD}
                        fill="none"
                        stroke={style.color}
                        strokeWidth={edgeWidth}
                        strokeDasharray={style.dasharray}
                        opacity={edgeOpacity}
                        markerEnd={`url(#arrow-${e.type})`}
                        style={{ transition: 'opacity 150ms ease' }}
                      />
                      <path
                        d={pathD}
                        fill="none"
                        stroke="rgba(0, 0, 0, 0.01)"
                        strokeWidth={24}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                        role="button"
                        data-testid={`graph-edge-${e.from.id}-${e.to.id}`}
                        aria-label={`${e.from.title} (${style.label}) ${e.to.title}`}
                        onMouseEnter={() => setHoveredEdgeKey(e.key)}
                        onMouseLeave={() => setHoveredEdgeKey(null)}
                        onFocus={() => pinEdge(e.key)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          pinEdge(e.key);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            pinEdge(e.key);
                          }
                        }}
                      />
                    </g>
                  );
                })}

                {positioned.map((n) => {
                  const dimmed = highlightedSet !== null && !highlightedSet.has(n.id);
                  const isSelected = activeId === n.id;
                  const isExplored = progressHydrated && exploredSet.has(n.id);
                  const color = DOMAIN_COLORS[n.domain];
                  return (
                    <g
                      key={n.id}
                      data-graph-interactive="true"
                      data-node-id={n.id}
                      data-explored={isExplored ? 'true' : 'false'}
                      transform={`translate(${n.x - NODE_WIDTH / 2}, ${n.y - NODE_HEIGHT / 2})`}
                      style={{
                        cursor: 'pointer',
                        opacity: dimmed ? 0.25 : 1,
                        transition: 'opacity 150ms ease',
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${n.title} (${formatDomainLabel(n.domain)})${isExplored ? ', Explored' : ''}`}
                      onMouseEnter={() => setHoveredId(n.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => {
                        setPinnedEdgeKey(null);
                        setPinnedId(n.id);
                      }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        togglePinNode(n.id);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          togglePinNode(n.id);
                        }
                      }}
                    >
                      <rect
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        rx={8}
                        fill={isExplored ? '#101d19' : '#12161d'}
                        stroke={isSelected ? '#ffffff' : isExplored ? '#34d399' : color}
                        strokeWidth={isSelected ? 2.2 : isExplored ? 1.8 : 1.4}
                      />
                      <foreignObject
                        x={0}
                        y={0}
                        width={NODE_WIDTH}
                        height={NODE_HEIGHT}
                        className="graph-node-fo"
                        aria-hidden="true"
                      >
                        <div className="graph-node-content">
                          <span className="graph-node-title">{n.title}</span>
                          <span className="graph-node-domain" style={{ color }}>
                            {formatDomainLabel(n.domain)}
                          </span>
                        </div>
                      </foreignObject>
                      {isExplored && (
                        <g
                          transform={`translate(${NODE_WIDTH - 14}, 14)`}
                          aria-hidden="true"
                          data-testid={`graph-node-explored-${n.id}`}
                        >
                          <circle
                            r={8}
                            fill="#064e3b"
                            stroke="#34d399"
                            strokeWidth={1.2}
                          />
                          <path
                            d="M -3.5 0.2 L -1 2.8 L 3.8 -2.5"
                            fill="none"
                            stroke="#6ee7b7"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      ) : effectiveViewMode === 'domains' ? (
        <div className="graph-domain-groups" data-testid="graph-domain-groups">
          {domainGroups.map((group) => (
            <details
              key={group.domain}
              className="graph-domain-accordion"
              data-testid={`domain-group-${group.domain}`}
              open={domainFilter === group.domain}
            >
              <summary className="graph-domain-summary">
                <span className="graph-domain-summary-left">
                  <span
                    className="graph-domain-dot"
                    style={{ backgroundColor: group.color }}
                    aria-hidden="true"
                  />
                  <span>{group.label}</span>
                </span>
                <span className="graph-domain-summary-left">
                  <span className="graph-domain-count">({group.nodes.length})</span>
                  <span className="graph-domain-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </span>
              </summary>

              <div className="graph-domain-body">
                {group.nodes.length === 0 ? (
                  <p className="graph-domain-empty">{UI_STRINGS.graph.treeNoConnections}</p>
                ) : (
                  group.nodes.map((n) => {
                    const isExplored = progressHydrated && exploredSet.has(n.id);
                    return (
                      <article
                        key={n.id}
                        className={`graph-tree-card${isExplored ? ' is-explored' : ''}`}
                        data-explored={isExplored ? 'true' : 'false'}
                      >
                        <div className="graph-tree-card-head">
                          {n.maturity_status && (
                            <span className={`badge badge-${n.maturity_status}`}>
                              {formatMaturityLabel(n.maturity_status)}
                            </span>
                          )}
                          {isExplored && (
                            <span className="graph-explored-badge">
                              <Check size={11} aria-hidden="true" />
                              <span>Explored</span>
                            </span>
                          )}
                        </div>
                        <h3 className="graph-tree-card-title">
                          <Link href={`/concepts/${n.id}`}>{n.title}</Link>
                        </h3>
                        <p className="graph-tree-card-summary">{n.summary_tldr}</p>

                        {n.relations.length > 0 ? (
                          <ul className="graph-tree-rel-list">
                            {n.relations.map((rel) => {
                              const target = allNodesMap.get(rel.target_id);
                              const style = EDGE_STYLES[rel.type];
                              return (
                                <li
                                  key={`${n.id}-${rel.target_id}-${rel.type}`}
                                  className="graph-tree-rel-item"
                                >
                                  <div className="graph-tree-rel-head">
                                    <span
                                      className="graph-tree-rel-badge"
                                      style={{ color: style.color }}
                                    >
                                      {style.label}
                                    </span>
                                    <Link href={`/concepts/${rel.target_id}`}>
                                      {target?.title ?? rel.target_id}
                                    </Link>
                                  </div>
                                  <p className="graph-tree-rel-note">{rel.note}</p>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="graph-tree-empty">{UI_STRINGS.graph.treeNoConnections}</p>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="graph-tree" data-testid="graph-dependency-tree">
          {layersForTree.map(([depth, layerNodes]) => (
            <section key={depth} className="graph-tree-layer">
              <h2 className="graph-tree-layer-title">
                {UI_STRINGS.graph.treeDepthPrefix} {depth}
              </h2>
              <div className="graph-tree-nodes">
                {layerNodes.map((n) => {
                  const isExplored = progressHydrated && exploredSet.has(n.id);
                  return (
                    <article
                      key={n.id}
                      className={`graph-tree-card${isExplored ? ' is-explored' : ''}`}
                      data-explored={isExplored ? 'true' : 'false'}
                    >
                      <div className="graph-tree-card-head">
                        <span className="badge">{formatDomainLabel(n.domain)}</span>
                        {n.maturity_status && (
                          <span className={`badge badge-${n.maturity_status}`}>
                            {formatMaturityLabel(n.maturity_status)}
                          </span>
                        )}
                        {isExplored && (
                          <span className="graph-explored-badge">
                            <Check size={11} aria-hidden="true" />
                            <span>Explored</span>
                          </span>
                        )}
                      </div>
                      <h3 className="graph-tree-card-title">
                        <Link href={`/concepts/${n.id}`}>{n.title}</Link>
                      </h3>
                      <p className="graph-tree-card-summary">{n.summary_tldr}</p>

                      {n.relations.length > 0 ? (
                        <ul className="graph-tree-rel-list">
                          {n.relations.map((rel) => {
                            const target = allNodesMap.get(rel.target_id);
                            const style = EDGE_STYLES[rel.type];
                            return (
                              <li
                                key={`${n.id}-${rel.target_id}-${rel.type}`}
                                className="graph-tree-rel-item"
                              >
                                <div className="graph-tree-rel-head">
                                  <span
                                    className="graph-tree-rel-badge"
                                    style={{ color: style.color }}
                                  >
                                    {style.label}
                                  </span>
                                  <Link href={`/concepts/${rel.target_id}`}>
                                    {target?.title ?? rel.target_id}
                                  </Link>
                                </div>
                                <p className="graph-tree-rel-note">{rel.note}</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="graph-tree-empty">{UI_STRINGS.graph.treeNoConnections}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div aria-label="Edge relationship legend" className="graph-legend">
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {UI_STRINGS.graph.edgesLegendTitle}:
        </span>
        {Object.entries(EDGE_STYLES).map(([type, style]) => (
          <span key={type} className="graph-legend-item">
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="0"
                y1="5"
                x2="28"
                y2="5"
                stroke={style.color}
                strokeWidth="2"
                strokeDasharray={style.dasharray}
              />
            </svg>
            <span>{style.label}</span>
          </span>
        ))}
        <span className="graph-legend-item">
          <span
            className="graph-domain-dot"
            style={{ backgroundColor: 'var(--text-muted)' }}
            aria-hidden="true"
          />
          <span>Pattern (no platform feature)</span>
        </span>
        {progressHydrated && (
          <span className="graph-legend-item graph-legend-explored" data-testid="graph-explored-counter">
            <span className="graph-explored-dot" aria-hidden="true">
              <Check size={10} />
            </span>
            <span>
              Explored ({exploredCountInGraph}/{nodes.length})
            </span>
          </span>
        )}
      </div>

      <div
        className="graph-context-panel"
        data-testid="graph-context-panel"
        aria-live="polite"
      >
        {activeEdge ? (
          <div className="graph-context-body">
            <div>
              <div className="graph-context-badges">
                <span className="badge" style={{ color: EDGE_STYLES[activeEdge.type].color }}>
                  {EDGE_STYLES[activeEdge.type].label}
                </span>
                <span className="graph-context-kind">{UI_STRINGS.graph.edgePanelTitle}</span>
              </div>
              <div className="graph-context-edge-titles">
                <Link href={`/concepts/${activeEdge.from.id}`}>{activeEdge.from.title}</Link>
                <ArrowRight size={14} className="inline shrink-0 mx-1" aria-hidden="true" />
                <Link href={`/concepts/${activeEdge.to.id}`}>{activeEdge.to.title}</Link>
              </div>
              <p className="graph-context-note">{activeEdge.note}</p>
            </div>
            <Link href={`/concepts/${activeEdge.from.id}`} className="lab-btn lab-btn-primary inline-flex items-center gap-1">
              <span>{UI_STRINGS.graph.openConcept}</span>
              <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
            </Link>
          </div>
        ) : activeNode ? (
          <div className="graph-context-body">
            <div>
              <div className="graph-context-badges">
                <span className="badge">{formatDomainLabel(activeNode.domain)}</span>
                {activeNode.maturity_status && (
                  <span className={`badge badge-${activeNode.maturity_status}`}>
                    {formatMaturityLabel(activeNode.maturity_status)}
                  </span>
                )}
                {progressHydrated && exploredSet.has(activeNode.id) && (
                  <span className="graph-explored-badge">
                    <Check size={11} aria-hidden="true" />
                    <span>Explored</span>
                  </span>
                )}
              </div>
              <strong style={{ display: 'block', marginTop: '4px' }}>{activeNode.title}</strong>
              <p className="graph-context-note">{activeNode.summary_tldr}</p>
            </div>
            <Link href={`/concepts/${activeNode.id}`} className="lab-btn lab-btn-primary inline-flex items-center gap-1">
              <span>{UI_STRINGS.graph.openConcept}</span>
              <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="graph-context-empty">{UI_STRINGS.graph.emptyPanelHint}</p>
        )}
      </div>
    </div>
  );
}
