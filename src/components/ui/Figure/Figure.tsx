import React from 'react';
import { FigureReveal } from './FigureReveal';
import './Figure.css';

export interface FigureProps {
  number?: number;
  question?: string;
  caption?: React.ReactNode;
  size?: 'prose' | 'wide';
  children: React.ReactNode;
}

export function Figure({ number, question, caption, size = 'prose', children }: FigureProps) {
  return (
    <figure className={size === 'wide' ? 'figure is-wide' : 'figure'} data-size={size}>
      {question ? <p className="figure-question">{question}</p> : null}
      <FigureReveal>{children}</FigureReveal>
      {caption || typeof number === 'number' ? (
        <figcaption className="figure-caption caps">
          {typeof number === 'number' ? `FIG. ${number}` : null}
          {typeof number === 'number' && caption ? ' · ' : null}
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
