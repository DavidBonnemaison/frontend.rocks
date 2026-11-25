'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { PatternComparatorLabConfig } from '@/lib/schemas';
import { useTrackLabInteraction } from '@/lib/analytics-hooks';
import { UI_STRINGS } from '@/lib/ui-strings';

export function PatternComparatorLab({
  config,
  headerExtra,
}: {
  config: PatternComparatorLabConfig;
  headerExtra?: React.ReactNode;
}) {
  const [focus, setFocus] = useState<'split' | 'before' | 'after'>('split');
  const trackInteract = useTrackLabInteraction(config.id);

  const handleSelectFocus = (next: 'split' | 'before' | 'after') => {
    setFocus(next);
    trackInteract();
  };

  const handleReset = () => {
    setFocus('split');
    trackInteract();
  };

  return (
    <section
      className="lab-card"
      data-testid="lab-pattern-comparator"
      aria-label={config.title}
    >
      <div className="lab-header">
        <div>
          <span className="lab-badge">{UI_STRINGS.sections.interactiveSimulator}</span>
          <h2 className="lab-title">{config.title}</h2>
          {config.description && <p className="lab-desc">{config.description}</p>}
        </div>
        <div className="lab-header-actions">
          <div className="segmented" role="group" aria-label="Display mode">
            <button
              type="button"
              onClick={() => handleSelectFocus('split')}
              className={`seg-btn ${focus === 'split' ? 'active' : ''}`}
              aria-pressed={focus === 'split'}
            >
              Side-by-side
            </button>
            <button
              type="button"
              onClick={() => handleSelectFocus('before')}
              className={`seg-btn ${focus === 'before' ? 'active' : ''}`}
              aria-pressed={focus === 'before'}
            >
              Before
            </button>
            <button
              type="button"
              onClick={() => handleSelectFocus('after')}
              className={`seg-btn ${focus === 'after' ? 'active' : ''}`}
              aria-pressed={focus === 'after'}
            >
              After
            </button>
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={handleReset}
            className="lab-btn lab-btn-ghost"
            data-testid="lab-reset"
            aria-label="Reset view"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="compare-visual-strip" aria-label="Before vs After comparison metrics">
        {(() => {
          const beforeLines = config.before.metrics.lines;
          const afterLines = config.after.metrics.lines;
          const maxLines = Math.max(beforeLines, afterLines, 1);
          const beforePct = Math.max(10, Math.round((beforeLines / maxLines) * 100));
          const afterPct = Math.max(10, Math.round((afterLines / maxLines) * 100));

          return (
            <>
              <div className="compare-visual-group">
                <div className="compare-visual-heading">Lines of Code</div>
                <div className={`compare-bar-row ${focus === 'after' ? 'dimmed' : ''}`}>
                  <span className="compare-bar-tag compare-bar-tag-before">Before</span>
                  <div className="compare-bar-track">
                    <div
                      className="compare-bar-fill compare-bar-fill-before"
                      style={{ width: `${beforePct}%` }}
                    />
                  </div>
                  <span className="compare-bar-val">{beforeLines}</span>
                </div>
                <div className={`compare-bar-row ${focus === 'before' ? 'dimmed' : ''}`}>
                  <span className="compare-bar-tag compare-bar-tag-after">After</span>
                  <div className="compare-bar-track">
                    <div
                      className="compare-bar-fill compare-bar-fill-after"
                      style={{ width: `${afterPct}%` }}
                    />
                  </div>
                  <span className="compare-bar-val">{afterLines}</span>
                </div>
              </div>

              <div className="compare-visual-group">
                <div className="compare-visual-heading">Reflows / Browser Cost</div>
                <div className={`compare-bar-row ${focus === 'after' ? 'dimmed' : ''}`}>
                  <span className="compare-bar-tag compare-bar-tag-before">Before</span>
                  <div className="compare-bar-track">
                    <div
                      className="compare-bar-fill compare-bar-fill-before"
                      style={{ width: '88%' }}
                    />
                  </div>
                  <span className="compare-bar-val compare-bar-text">{config.before.metrics.reflows}</span>
                </div>
                <div className={`compare-bar-row ${focus === 'before' ? 'dimmed' : ''}`}>
                  <span className="compare-bar-tag compare-bar-tag-after">After</span>
                  <div className="compare-bar-track">
                    <div
                      className="compare-bar-fill compare-bar-fill-after"
                      style={{ width: '28%' }}
                    />
                  </div>
                  <span className="compare-bar-val compare-bar-text">{config.after.metrics.reflows}</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      <div className={`compare-grid ${focus === 'split' ? 'compare-split' : 'compare-single'}`}>
        {(focus === 'split' || focus === 'before') && (
          <div className="compare-pane compare-before">
            <div className="compare-pane-head">
              <span className="pane-tag pane-tag-legacy">Before</span>
              <strong>{config.before.label}</strong>
            </div>
            <pre className="lab-code">
              <code>{config.before.code}</code>
            </pre>
            <div className="metrics-strip">
              <span>Lines: <strong>{config.before.metrics.lines}</strong></span>
              <span>Reflows: <strong>{config.before.metrics.reflows}</strong></span>
              <span>Dependencies: <strong>{config.before.metrics.dependencies}</strong></span>
            </div>
            {config.before.previewNote && (
              <p className="preview-note">{config.before.previewNote}</p>
            )}
          </div>
        )}

        {(focus === 'split' || focus === 'after') && (
          <div className="compare-pane compare-after">
            <div className="compare-pane-head">
              <span className="pane-tag pane-tag-modern">After (Native)</span>
              <strong>{config.after.label}</strong>
            </div>
            <pre className="lab-code">
              <code>{config.after.code}</code>
            </pre>
            <div className="metrics-strip">
              <span>Lines: <strong>{config.after.metrics.lines}</strong></span>
              <span>Reflows: <strong>{config.after.metrics.reflows}</strong></span>
              <span>Dependencies: <strong>{config.after.metrics.dependencies}</strong></span>
            </div>
            {config.after.previewNote && (
              <p className="preview-note">{config.after.previewNote}</p>
            )}
          </div>
        )}
      </div>

      <LiveComparatorPreview id={config.id} />
    </section>
  );
}

function LiveComparatorPreview({ id }: { id: string }) {
  const [count, setCount] = useState(0);
  const [compact, setCompact] = useState(false);

  if (id === 'native-dialog-element') {
    return (
      <div className="preview-note" style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Live DOM Sandbox:</span>
        <button
          type="button"
          className="lab-btn"
          onClick={() => {
            const el = document.getElementById(`demo-dialog-${id}`) as HTMLDialogElement | null;
            el?.showModal();
          }}
        >
          Open native &lt;dialog&gt;.showModal()
        </button>
        <dialog
          id={`demo-dialog-${id}`}
          style={{
            background: '#11161f',
            color: '#eef2f7',
            border: '1px solid #38bdf8',
            borderRadius: '10px',
            padding: '18px',
            maxWidth: '360px',
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
            Rendered in the browser Top Layer with native Escape and inert background.
          </p>
          <form method="dialog">
            <button type="submit" className="lab-btn lab-btn-primary">
              Close
            </button>
          </form>
        </dialog>
      </div>
    );
  }

  if (id === 'popover-api-light-dismiss') {
    return (
      <div className="preview-note" style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Live DOM Sandbox:</span>
        <button type="button" className="lab-btn" popoverTarget={`demo-popover-${id}`}>
          Toggle native popover
        </button>
        <div
          id={`demo-popover-${id}`}
          popover="auto"
          style={{
            background: '#11161f',
            color: '#eef2f7',
            border: '1px solid #2dd4bf',
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '0.85rem',
          }}
        >
          Native Top Layer popover with automatic light-dismiss.
        </div>
      </div>
    );
  }

  if (id === 'fine-grained-signals') {
    return (
      <div className="preview-note" style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Live Reactive Node:</span>
        <button type="button" className="lab-btn" onClick={() => setCount((c) => c + 1)}>
          Increment signal ({count})
        </button>
        <code>doubled = {count * 2}</code>
      </div>
    );
  }

  if (id === 'js-resize-observer-pattern') {
    return (
      <div className="preview-note" style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Live Container:</span>
        <button type="button" className="lab-btn" onClick={() => setCompact((v) => !v)}>
          Toggle width ({compact ? '260px' : '460px'})
        </button>
        <span style={{ color: 'var(--text)' }}>
          Layout: <strong>{compact ? '1 column (stacked)' : '2 columns (grid)'}</strong>
        </span>
      </div>
    );
  }

  return null;
}
