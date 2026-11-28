import React from 'react';
import { Card, DomainLabel, PieceBlock } from '@/components/ui';
import type { ConceptPageView } from '@/lib/pages/view-models';
import { UI_STRINGS } from '@/lib/ui-strings';
import './ArticleBlocks.css';

export interface ConceptConnectionsProps {
  prerequisites: ConceptPageView['prerequisites'];
  followUps: ConceptPageView['followUps'];
  relatedAutopsies: ConceptPageView['relatedAutopsies'];
  vsPairs: ConceptPageView['vsPairs'];
}

export function ConceptConnections({
  prerequisites,
  followUps,
  relatedAutopsies,
  vsPairs,
}: ConceptConnectionsProps) {
  const hasAny =
    prerequisites.length > 0 ||
    followUps.length > 0 ||
    relatedAutopsies.length > 0 ||
    vsPairs.length > 0;

  if (!hasAny) return null;

  return (
    <section
      id="connections"
      className="concept-connections is-wide"
      data-block="connections"
      aria-labelledby="connections-heading"
    >
      <h2 id="connections-heading" className="concept-connections-title">
        Where this connects
      </h2>

      {(prerequisites.length > 0 || followUps.length > 0) && (
        <div className="concept-connections-cols">
          {prerequisites.length > 0 && (
            <div className="concept-connections-group">
              <h3 className="concept-connections-group-label caps">Prerequisites</h3>
              <div className="ruled-list">
                {prerequisites.map((item) => (
                  <Card
                    key={item.id}
                    href={`/concepts/${item.id}/`}
                    eyebrow={<DomainLabel domain={item.domain} />}
                    title={item.title}
                    description={item.note}
                  />
                ))}
              </div>
            </div>
          )}

          {followUps.length > 0 && (
            <div className="concept-connections-group">
              <h3 className="concept-connections-group-label caps">Next &amp; related</h3>
              <div className="ruled-list">
                {followUps.map((item) => (
                  <Card
                    key={item.id}
                    href={`/concepts/${item.id}/`}
                    eyebrow={<DomainLabel domain={item.domain} />}
                    title={item.title}
                    description={item.note}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {relatedAutopsies.length > 0 && (
        <div className="concept-connections-group" data-testid="seen-in-autopsies">
          <h3 className="concept-connections-group-label caps">
            {UI_STRINGS.autopsies.seenInAutopsies}
          </h3>
          <div className="concept-autopsies-grid">
            {relatedAutopsies.map((a) => (
              <PieceBlock
                key={a.id}
                color={a.pieceColor}
                number={a.number}
                kicker="CASE"
                title={a.title}
                dek={a.dek}
                size="tile"
                href={`/autopsies/${a.id}/`}
              />
            ))}
          </div>
        </div>
      )}

      {vsPairs.length > 0 && (
        <div className="concept-connections-group" data-testid="concept-vs-comparisons">
          <h3 className="concept-connections-group-label caps">Mechanical Comparisons</h3>
          <ul className="concept-vs-list ruled-list">
            {vsPairs.map((pair) => (
              <li key={pair.slug} className="concept-vs-item">
                <span className="caps">{pair.relationLabel}</span>
                <a href={`/vs/${pair.slug}/`} className="concept-vs-link">
                  {pair.title}
                </a>
                <p className="concept-vs-note">{pair.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
