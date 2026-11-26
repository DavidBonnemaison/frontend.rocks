import React from 'react';
import './Card.css';

export interface CardProps {
  href?: string;
  eyebrow?: React.ReactNode;
  title: string;
  titleAs?: 'h2' | 'h3';
  description?: string;
  meta?: React.ReactNode;
  media?: React.ReactNode;
}

export function Card({
  href,
  eyebrow,
  title,
  titleAs = 'h3',
  description,
  meta,
  media,
}: CardProps) {
  const Heading = titleAs;

  return (
    <article className="ui-card" data-has-media={media ? 'true' : 'false'}>
      <div className="ui-card-inner">
        <div className="ui-card-body">
          {eyebrow ? <div className="caps">{eyebrow}</div> : null}
          <Heading className="ui-card-title">
            {href ? (
              <a href={href} className="ui-card-link">
                {title}
              </a>
            ) : (
              title
            )}
          </Heading>
          {description ? <p className="ui-card-description">{description}</p> : null}
          {meta ? <div>{meta}</div> : null}
        </div>
        {media ? <div className="ui-card-media">{media}</div> : null}
      </div>
    </article>
  );
}
