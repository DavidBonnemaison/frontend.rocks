import React from 'react';
import { pieceAttrs, type PieceColor } from '@/lib/design/piece-colors';
import { ReadingProgress } from './ReadingProgress';
import './ArticleLayout.css';

export interface ArticleLayoutProps {
  piece?: { color: PieceColor };
  header: React.ReactNode;
  rail?: React.ReactNode;
  toc?: Array<{ id: string; label: string; level?: 2 | 3 }>;
  children: React.ReactNode;
  afterContent?: React.ReactNode;
  testId?: string;
}

export function ArticleLayout({
  piece,
  header,
  rail,
  children,
  afterContent,
  testId,
}: ArticleLayoutProps) {
  return (
    <article
      className="article"
      {...(piece ? pieceAttrs(piece.color) : {})}
      data-testid={testId}
    >
      <ReadingProgress />
      <div className="article-grid flow">
        {header}
        {rail ? (
          <>
            <aside className="article-rail" aria-label="About this page">
              {rail}
            </aside>
            <details className="article-rail-inline">
              <summary className="caps">About this page</summary>
              <div className="article-rail-inline-body">{rail}</div>
            </details>
          </>
        ) : null}
        {children}
        {afterContent}
      </div>
    </article>
  );
}
