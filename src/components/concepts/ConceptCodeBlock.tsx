import React from 'react';
import { highlightCode } from '@/lib/shiki';
import { CopyCodeButton } from './CopyCodeButton';

interface ConceptCodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children?: React.ReactNode;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return '';
}

export async function ConceptCodeBlock({ children, ...rest }: ConceptCodeBlockProps) {
  let lang = '';
  let rawCode = '';

  if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(children)) {
    const className = children.props.className ?? '';
    const match = /language-([a-zA-Z0-9_-]+)/.exec(className);
    if (match) {
      lang = match[1];
    }
    rawCode = extractText(children.props.children).replace(/\n$/, '');
  } else {
    rawCode = extractText(children).replace(/\n$/, '');
  }

  const displayLang = lang ? lang.toUpperCase() : 'CODE';
  const highlighted = rawCode ? await highlightCode(rawCode, lang) : null;

  return (
    <div className="code-block-shell" data-lang={highlighted?.resolvedLang ?? (lang || 'text')}>
      <div className="code-block-header">
        <span className="code-lang-badge">{displayLang}</span>
        {rawCode ? <CopyCodeButton rawCode={rawCode} /> : null}
      </div>
      {highlighted ? (
        <div
          className="code-block-shiki"
          dangerouslySetInnerHTML={{ __html: highlighted.html }}
        />
      ) : (
        <pre {...rest}>
          <code className={lang ? `language-${lang}` : undefined}>{children}</code>
        </pre>
      )}
    </div>
  );
}
