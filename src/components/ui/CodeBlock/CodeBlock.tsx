import React from 'react';
import { highlightCode } from '@/lib/shiki';
import { CopyCodeButton } from '@/components/concepts/CopyCodeButton';
import './CodeBlock.css';

export interface CodeBlockProps {
  code: string;
  lang?: string;
  wide?: boolean;
}

export async function CodeBlock({ code, lang, wide = false }: CodeBlockProps) {
  const trimmed = code.replace(/\n$/, '');
  const displayLang = lang ? lang.toUpperCase() : 'CODE';
  const highlighted = trimmed ? await highlightCode(trimmed, lang) : null;

  return (
    <div
      className={wide ? 'code-block is-wide' : 'code-block'}
      data-lang={highlighted?.resolvedLang ?? (lang || 'text')}
    >
      <div className="code-block-head">
        <span className="code-block-lang caps">{displayLang}</span>
        {trimmed ? <CopyCodeButton rawCode={trimmed} /> : null}
      </div>
      {highlighted ? (
        <div dangerouslySetInnerHTML={{ __html: highlighted.html }} />
      ) : (
        <pre>
          <code>{trimmed}</code>
        </pre>
      )}
    </div>
  );
}
