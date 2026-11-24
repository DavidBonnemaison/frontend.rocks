import React from 'react';
import Link from 'next/link';
import type { Domain, MaturityStatus } from '@/lib/schemas';
import { UI_STRINGS } from '@/lib/ui-strings';

export interface MiniGraphNode {
  id: string;
  title: string;
  domain?: Domain;
  maturity_status?: MaturityStatus;
  relationLabel?: string;
}

interface NeighborhoodMiniGraphProps {
  current: MiniGraphNode;
  prerequisites: MiniGraphNode[];
  unlockedAndRelated: MiniGraphNode[];
}

export function NeighborhoodMiniGraph({
  current,
  prerequisites,
  unlockedAndRelated,
}: NeighborhoodMiniGraphProps) {
  const hasPrereqs = prerequisites.length > 0;
  const hasRight = unlockedAndRelated.length > 0;

  if (!hasPrereqs && !hasRight) {
    return null;
  }

  return (
    <div className="mini-graph" aria-label="Local Concept Neighborhood">
      <div className="mini-graph-col">
        <div className="mini-graph-col-label">{UI_STRINGS.relations.usefulPrerequisites}</div>
        {hasPrereqs ? (
          <ul className="mini-graph-list">
            {prerequisites.map((node) => (
              <li key={node.id}>
                <Link href={`/concepts/${node.id}`} className="mini-graph-node">
                  <span className="mini-graph-node-title">{node.title}</span>
                  {node.domain && (
                    <span className="mini-graph-node-meta">
                      {UI_STRINGS.domains[node.domain] ?? node.domain}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mini-graph-empty">Foundational node</div>
        )}
      </div>

      <div className="mini-graph-connector" aria-hidden="true">
        <svg viewBox="0 0 48 24" className="mini-graph-arrow">
          <line x1="2" y1="12" x2="40" y2="12" stroke="currentColor" strokeWidth="1.5" />
          <polyline
            points="35,7 42,12 35,17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="mini-graph-col mini-graph-center-col">
        <div className="mini-graph-node mini-graph-node-current" aria-current="page">
          {current.domain && (
            <span className="mini-graph-node-meta">
              {UI_STRINGS.domains[current.domain] ?? current.domain}
            </span>
          )}
          <span className="mini-graph-node-title">{current.title}</span>
        </div>
      </div>

      <div className="mini-graph-connector" aria-hidden="true">
        <svg viewBox="0 0 48 24" className="mini-graph-arrow">
          <line x1="2" y1="12" x2="40" y2="12" stroke="currentColor" strokeWidth="1.5" />
          <polyline
            points="35,7 42,12 35,17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="mini-graph-col">
        <div className="mini-graph-col-label">{UI_STRINGS.relations.whatThisUnlocks}</div>
        {hasRight ? (
          <ul className="mini-graph-list">
            {unlockedAndRelated.map((node) => (
              <li key={`${node.relationLabel ?? 'rel'}-${node.id}`}>
                <Link href={`/concepts/${node.id}`} className="mini-graph-node">
                  {node.relationLabel && (
                    <span className="mini-graph-node-tag">{node.relationLabel}</span>
                  )}
                  <span className="mini-graph-node-title">{node.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mini-graph-empty">Leaf concept</div>
        )}
      </div>
    </div>
  );
}
