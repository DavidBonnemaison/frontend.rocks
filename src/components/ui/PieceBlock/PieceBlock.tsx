import React from 'react';
import { pieceAttrs, type PieceColor } from '@/lib/design/piece-colors';
import type { GeometrySnapshot } from '@/lib/design/schematic-snapshot';
import { Schematic } from '../Schematic/Schematic';
import './PieceBlock.css';

export interface PieceBlockProps {
  color: PieceColor;
  number: string;
  kicker: string;
  title: string;
  dek?: string;
  schematic?: GeometrySnapshot | null;
  size?: 'hero' | 'tile';
  href?: string;
  titleAs?: 'h1' | 'h2' | 'h3';
}

export function PieceBlock({
  color,
  number,
  kicker,
  title,
  dek,
  schematic,
  size = 'hero',
  href,
  titleAs,
}: PieceBlockProps) {
  const Heading = titleAs ?? (size === 'hero' ? 'h1' : 'h3');

  const visual = schematic ? (
    <Schematic
      snapshot={schematic}
      width={size === 'hero' ? 640 : 400}
      highlight="var(--piece-on)"
      label={`${kicker} ${number}: ${title}`}
    />
  ) : (
    <span className="piece-block-giant-num" aria-hidden="true">
      {number}
    </span>
  );

  if (size === 'tile') {
    return (
      <article className="piece-block" data-size="tile" {...pieceAttrs(color)}>
        <div className="piece-block-tile-head caps">
          <span>{number}</span>
          <span>{kicker}</span>
        </div>
        <div className="piece-block-field">{visual}</div>
        <Heading className="piece-block-tile-title">
          {href ? (
            <a href={href} className="piece-block-link">
              {title}
            </a>
          ) : (
            title
          )}
        </Heading>
        {dek ? <p className="piece-block-tile-dek">{dek}</p> : null}
      </article>
    );
  }

  return (
    <header className="piece-block" data-size="hero" {...pieceAttrs(color)}>
      <div className="piece-block-field">{visual}</div>
      <div className="piece-block-cartouche">
        <div className="piece-block-kicker caps">
          <span>{kicker}</span>
          <span>{number}</span>
        </div>
        <Heading className="piece-block-hero-title">{title}</Heading>
        {dek ? <p className="piece-block-hero-dek">{dek}</p> : null}
      </div>
    </header>
  );
}
