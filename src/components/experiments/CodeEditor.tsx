'use client';

import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

(globalThis as Record<string, unknown>).__frCodeMirrorLoaded = true;

export interface CodeEditorProps {
  value: string;
  language: 'css' | 'js' | 'html';
  label: string;
  onChange: (next: string) => void;
  onEscape?: () => void;
}

const instrumentTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--inst-surface, #f8f7f3)',
    color: 'var(--inst-ink, #171717)',
    border: '1px solid var(--inst-rule, #d6d3cb)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.875rem',
    lineHeight: '1.5',
  },
  '.cm-content': {
    padding: '10px 12px',
    caretColor: 'var(--inst-accent, #c43d18)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--inst-accent, #c43d18)',
  },
  '&.cm-focused': {
    outline: '2px solid var(--inst-accent, #c43d18)',
    outlineOffset: '1px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--inst-bg, #ffffff)',
    color: 'var(--inst-muted, #6b6860)',
    borderRight: '1px solid var(--inst-rule, #d6d3cb)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--inst-accent, #c43d18) 6%, transparent)',
  },
});

const instrumentHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--inst-accent, #c43d18)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--inst-ink, #171717)', fontWeight: '600' },
  { tag: [tags.string, tags.number, tags.color], color: 'var(--inst-ok, #1b7a46)' },
  { tag: [tags.comment], color: 'var(--inst-muted, #6b6860)', fontStyle: 'italic' },
]);

function languageExtension(lang: 'css' | 'js' | 'html') {
  if (lang === 'css') return css();
  if (lang === 'html') return html();
  return javascript();
}

export default function CodeEditor({
  value,
  language,
  label,
  onChange,
  onEscape,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const escapeBinding = keymap.of([
      {
        key: 'Escape',
        run: () => {
          onEscapeRef.current?.();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        escapeBinding,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        languageExtension(language),
        instrumentTheme,
        syntaxHighlighting(instrumentHighlight),
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate EditorView when language or label changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, label]);

  // Keep external resets in sync with the editor document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="experiment-code-editor"
      data-testid="challenge-code-editor"
      data-language={language}
    />
  );
}
