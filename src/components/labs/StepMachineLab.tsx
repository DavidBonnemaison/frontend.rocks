'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { StepMachineLabConfig } from '@/lib/schemas';
import { UI_STRINGS } from '@/lib/ui-strings';
import './StepMachineLab.css';

function formatCodeHighlight(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('\n')) {
    return trimmed;
  }

  let result = '';
  let quote: string | null = null;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (quote) {
      result += ch;
      if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && trimmed[i + 1] === '/') {
      result += trimmed.slice(i);
      break;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      result += ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      result += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      result += ch;
      continue;
    }

    if (ch === ';' && depth === 0) {
      result += ';';
      let j = i + 1;
      while (j < trimmed.length && trimmed[j] === ' ') {
        j += 1;
      }
      if (j > i + 1 && j < trimmed.length) {
        result += '\n';
        i = j - 1;
      }
      continue;
    }

    result += ch;
  }

  return result;
}

function formatStateValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isRegisterModified(
  prevState: Record<string, unknown> | undefined,
  key: string,
  value: unknown
): boolean {
  if (!prevState) return false;
  if (!(key in prevState)) return true;
  return JSON.stringify(prevState[key]) !== JSON.stringify(value);
}

export function StepMachineLab({
  config,
  headerExtra,
}: {
  config: StepMachineLabConfig;
  headerExtra?: React.ReactNode;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const total = config.steps.length;
  const current = config.steps[stepIndex];
  const prevState = stepIndex > 0 ? config.steps[stepIndex - 1]?.state : undefined;

  const handleReset = () => setStepIndex(0);
  const handlePrev = () => setStepIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setStepIndex((i) => Math.min(total - 1, i + 1));

  return (
    <section
      className="lab-card"
      data-testid="lab-step-machine"
      aria-label={config.title}
    >
      <div className="lab-header">
        <div>
          <span className="lab-badge">{UI_STRINGS.sections.interactiveSimulator}</span>
          <h2 className="lab-title">{config.title}</h2>
          {config.description && <p className="lab-desc">{config.description}</p>}
        </div>
        <div className="lab-header-actions">
          {headerExtra}
          <button
            type="button"
            onClick={handleReset}
            className="lab-btn lab-btn-ghost"
            data-testid="lab-reset"
            aria-label="Reset simulation"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div
        className="step-progress-bar"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Simulation progress"
      >
        <div
          className="step-progress-fill"
          style={{ width: `${Math.round(((stepIndex + 1) / total) * 100)}%` }}
        />
      </div>

      {current.visualNodes && current.visualNodes.length > 0 && (
        <div className="step-nodes" role="list" aria-label="Pipeline steps">
          {current.visualNodes.map((node, idx) => {
            const isLast = idx === current.visualNodes!.length - 1;
            const connectorStatus =
              node.status === 'done'
                ? 'done'
                : node.status === 'active'
                  ? 'active'
                  : 'idle';
            return (
              <React.Fragment key={node.id}>
                <div
                  role="listitem"
                  className={`step-node step-node-${node.status}`}
                >
                  <span className="step-node-dot" aria-hidden="true" />
                  <span>{node.label}</span>
                </div>
                {!isLast && (
                  <span
                    className={`step-connector step-connector-${connectorStatus}`}
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 12"
                      width="24"
                      height="12"
                      fill="none"
                      className="step-connector-svg"
                    >
                      <line
                        x1="1"
                        y1="6"
                        x2="19"
                        y2="6"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="step-connector-line"
                      />
                      <polyline
                        points="15,2 20,6 15,10"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div className="step-body">
        <div key={stepIndex} className="step-info step-enter">
          <div className="step-counter">
            Step {stepIndex + 1} / {total}: <strong>{current.label}</strong>
          </div>
          <p className="step-text">{current.description}</p>
          {current.codeHighlight && (
            <pre className="lab-code">
              <code>{formatCodeHighlight(current.codeHighlight)}</code>
            </pre>
          )}
        </div>

        <div className="step-state">
          <div className="state-label">Internal State / Memory</div>
          <dl className="state-grid">
            {Object.entries(current.state).map(([k, v], idx) => {
              const modified = isRegisterModified(prevState, k, v);
              return (
                <div
                  key={`${stepIndex}-${k}`}
                  className={`state-row state-row-enter${modified ? ' state-row-modified' : ''}`}
                  data-modified={modified ? 'true' : undefined}
                  style={{ animationDelay: `${Math.min(idx, 6) * 30}ms` }}
                >
                  <dt className="state-row-header">
                    <span className="state-key">{k}</span>
                    {modified && (
                      <span className="state-modified-badge">Updated</span>
                    )}
                  </dt>
                  <dd className="state-val">{formatStateValue(v)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      <div className="lab-controls">
        <button
          type="button"
          onClick={handlePrev}
          disabled={stepIndex === 0}
          className="lab-btn"
          data-testid="lab-prev"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          <span>Previous</span>
        </button>

        <div className="step-dots" role="tablist" aria-label="Direct step selection">
          {config.steps.map((s, idx) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={idx === stepIndex}
              aria-label={`Step ${idx + 1}: ${s.label}`}
              onClick={() => setStepIndex(idx)}
              className={`step-dot ${idx === stepIndex ? 'active' : ''}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          disabled={stepIndex === total - 1}
          className="lab-btn lab-btn-primary"
          data-testid="lab-next"
        >
          <span>Next</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
