'use client';

import React, { useId, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  XCircle,
} from 'lucide-react';
import type { AutopsyCaseFile, FailureMode } from '@/lib/schemas';
import { buildDetectiveOptions, type DetectiveOption } from '@/lib/detective';
import './DevToolsDetective.css';

interface DevToolsDetectiveProps {
  slug: string;
  caseFile: Pick<AutopsyCaseFile, 'bad_fixes' | 'root_cause'>;
  failureMode?: FailureMode;
  hasSimulator?: boolean;
}

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function DevToolsDetective({
  slug,
  caseFile,
  failureMode,
  hasSimulator = true,
}: DevToolsDetectiveProps) {
  const panelId = useId();
  const headingId = useId();

  const options = useMemo<DetectiveOption[]>(
    () => buildDetectiveOptions(slug, caseFile, failureMode),
    [slug, caseFile, failureMode]
  );

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triedIds, setTriedIds] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === selectedId) ?? null,
    [options, selectedId]
  );
  const rootCauseOption = useMemo(
    () => options.find((opt) => opt.isRootCause) ?? null,
    [options]
  );

  const handleSelectOption = (option: DetectiveOption) => {
    setSelectedId(option.id);
    if (!triedIds.includes(option.id)) {
      setTriedIds((prev) => [...prev, option.id]);
    }
    if (option.isRootCause) {
      setRevealed(false);
    }
  };

  const handleRevealRootCause = () => {
    if (!rootCauseOption) return;
    setSelectedId(rootCauseOption.id);
    setRevealed(true);
    if (!triedIds.includes(rootCauseOption.id)) {
      setTriedIds((prev) => [...prev, rootCauseOption.id]);
    }
  };

  const handleSkip = () => {
    setIsCollapsed(true);
  };

  const isConfirmed = Boolean(selectedOption?.isRootCause);

  return (
    <section
      className="detective-panel"
      aria-labelledby={headingId}
      data-testid="devtools-detective"
    >
      <div
        className={`detective-header${isCollapsed ? ' detective-header--collapsed' : ''}`}
      >
        <div className="detective-title-group">
          <h2 id={headingId} className="detective-title">
            <Search size={15} color="var(--accent)" aria-hidden="true" />
            <span>DevTools Detective</span>
          </h2>
          <span className="detective-tag">Optional diagnosis</span>
        </div>

        <div className="detective-controls">
          {!isCollapsed && (
            <a
              href="#incident-report"
              className="detective-skip-link"
              onClick={handleSkip}
              data-testid="detective-skip"
            >
              <span>Skip to dissection</span>
              <ArrowDownRight size={14} aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            className="detective-toggle-btn"
            aria-expanded={!isCollapsed}
            aria-controls={panelId}
            onClick={() => setIsCollapsed((prev) => !prev)}
            data-testid="detective-toggle"
          >
            <span>{isCollapsed ? 'Open diagnostic' : 'Collapse'}</span>
            {isCollapsed ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronUp size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div id={panelId} className="detective-body">
          <p className="detective-prompt">
            Before reading the incident timeline, select the hypothesis that explains the root
            cause of this failure.
          </p>

          <div
            className="detective-options"
            role="group"
            aria-label="Diagnostic hypotheses"
          >
            {options.map((option, index) => {
              const isSelected = selectedId === option.id;
              const wasTried = triedIds.includes(option.id);

              let stateClass = '';
              if (wasTried && option.isRootCause) {
                stateClass = ' detective-option--confirmed';
              } else if (wasTried && !option.isRootCause) {
                stateClass = ' detective-option--rejected';
              } else if (isSelected) {
                stateClass = ' detective-option--selected';
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`detective-option${stateClass}`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelectOption(option)}
                  data-testid="detective-option"
                  data-option-id={option.id}
                  data-is-root-cause={option.isRootCause ? 'true' : 'false'}
                >
                  <span className="detective-option-key" aria-hidden="true">
                    {OPTION_KEYS[index] ?? String(index + 1)}
                  </span>
                  <span className="detective-option-label">
                    {renderInlineCode(option.label)}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="detective-feedback-region"
            aria-live="polite"
            aria-atomic="true"
            data-testid="detective-feedback"
          >
            {selectedOption && !selectedOption.isRootCause && (
              <div className="detective-feedback detective-feedback--rejected">
                <div className="detective-feedback-header">
                  <span className="detective-status-badge detective-status-badge--rejected">
                    <XCircle size={13} aria-hidden="true" />
                    <span>Patch failed</span>
                  </span>
                </div>
                <p className="detective-feedback-text">
                  {renderInlineCode(
                    selectedOption.outcome ??
                      'This patch addresses a surface symptom rather than the underlying engine mechanism.'
                  )}
                </p>
                <div className="detective-feedback-actions">
                  <span className="detective-hint">
                    Pick another hypothesis or reveal the root cause.
                  </span>
                  <button
                    type="button"
                    className="detective-reveal-btn"
                    onClick={handleRevealRootCause}
                    data-testid="detective-reveal"
                  >
                    Reveal root cause
                  </button>
                </div>
              </div>
            )}

            {isConfirmed && selectedOption && (
              <div className="detective-feedback detective-feedback--confirmed">
                <div className="detective-feedback-header">
                  <span className="detective-status-badge detective-status-badge--confirmed">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>{revealed ? 'Root cause revealed' : 'Root cause confirmed'}</span>
                  </span>
                </div>
                <p className="detective-feedback-text">
                  {renderInlineCode(selectedOption.label)}
                </p>
                <div className="detective-feedback-actions">
                  <a
                    href="#causal-chain"
                    className="detective-anchor-link"
                    data-testid="detective-link-causal-chain"
                  >
                    <span>Jump to causal chain</span>
                    <ArrowDownRight size={14} aria-hidden="true" />
                  </a>
                  {hasSimulator && (
                    <a
                      href="#failure-simulator"
                      className="detective-anchor-link"
                      data-testid="detective-link-failure-simulator"
                    >
                      <span>Jump to failure simulator</span>
                      <ArrowDownRight size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
