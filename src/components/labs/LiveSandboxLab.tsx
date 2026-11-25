'use client';

import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { LiveSandboxControl, LiveSandboxLabConfig } from '@/lib/schemas';
import { UI_STRINGS } from '@/lib/ui-strings';
import { useTrackLabInteraction } from '@/lib/analytics-hooks';
import './LiveSandboxLab.css';

export type SandboxControlValues = Record<string, number | boolean | string>;

/**
 * Strict iframe sandbox attribute: allows script execution inside the isolated
 * opaque origin without granting access to parent DOM, cookies, or storage.
 */
export const SANDBOX_IFRAME_POLICY = 'allow-scripts' as const;

export function getInitialSandboxValues(config: LiveSandboxLabConfig): SandboxControlValues {
  const init: SandboxControlValues = {};
  for (const ctrl of config.controls) {
    init[ctrl.key] = ctrl.defaultValue;
  }
  return init;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function sanitizeScriptContent(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

function resolveControlCssVar(
  ctrl: LiveSandboxControl,
  val: number | boolean | string
): string | null {
  if (ctrl.target !== 'css-var' || !ctrl.cssVar) return null;
  const formatted =
    typeof val === 'number' && ctrl.unit ? `${val}${ctrl.unit}` : String(val);
  return `  ${ctrl.cssVar}: ${formatted};`;
}

function resolveControlClassName(
  ctrl: LiveSandboxControl,
  val: number | boolean | string
): string | null {
  if (ctrl.target !== 'class') return null;
  if (ctrl.kind === 'toggle') {
    return Boolean(val) && ctrl.className ? ctrl.className : null;
  }
  if (ctrl.kind === 'select') {
    const raw = String(val);
    return `${ctrl.classPrefix ?? ''}${raw}`;
  }
  return null;
}

/**
 * Deterministically builds a self-contained HTML document for the sandboxed
 * iframe srcDoc. Contains zero external URLs and zero non-deterministic values.
 */
export function buildSandboxSrcDoc(
  config: LiveSandboxLabConfig,
  values: SandboxControlValues
): string {
  const cssVarLines: string[] = [];
  const rootClasses: string[] = ['sandbox-root'];
  const dataAttrs: string[] = [];

  for (const ctrl of config.controls) {
    const val = values[ctrl.key] ?? ctrl.defaultValue;
    const varLine = resolveControlCssVar(ctrl, val);
    if (varLine) cssVarLines.push(varLine);

    const cls = resolveControlClassName(ctrl, val);
    if (cls) rootClasses.push(cls);

    const attrKey = ctrl.key.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    dataAttrs.push(`data-${attrKey}="${escapeHtmlAttr(String(val))}"`);
  }

  const rootVarBlock =
    cssVarLines.length > 0 ? `:root {\n${cssVarLines.join('\n')}\n}\n` : '';

  const baseCss = `
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #090b0f;
  color: #e2e8f0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  min-height: 100%;
}
body {
  padding: 12px;
}
code, pre, .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
`.trim();

  const scriptTag = config.js
    ? `\n<script>\n(function(){\n${sanitizeScriptContent(config.js)}\n})();\n</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${baseCss}
${rootVarBlock}
${sanitizeStyleContent(config.css)}
</style>
</head>
<body>
<div id="sandbox-root" class="${escapeHtmlAttr(rootClasses.join(' '))}" ${dataAttrs.join(' ')}>
${config.html}
</div>${scriptTag}
</body>
</html>`;
}

export function LiveSandboxLab({
  config,
  headerExtra,
}: {
  config: LiveSandboxLabConfig;
  headerExtra?: React.ReactNode;
}) {
  const [values, setValues] = useState<SandboxControlValues>(() =>
    getInitialSandboxValues(config)
  );
  const trackInteract = useTrackLabInteraction(config.id);

  const srcDoc = useMemo(() => buildSandboxSrcDoc(config, values), [config, values]);

  const handleReset = () => setValues(getInitialSandboxValues(config));

  return (
    <section
      className="lab-card"
      data-testid="lab-live-sandbox"
      aria-label={config.title}
    >
      <div className="lab-header">
        <div>
          <span className="lab-badge">Live Browser Sandbox</span>
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
            aria-label="Reset sandbox parameters"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="sim-layout">
        <div className="sim-controls">
          {config.controls.map((ctrl) => {
            const val = values[ctrl.key];
            const inputId = `${config.id}-${ctrl.key}`;
            const displayVal =
              ctrl.kind === 'toggle'
                ? Boolean(val)
                  ? UI_STRINGS.controls.enabled
                  : UI_STRINGS.controls.disabled
                : `${String(val)}${ctrl.unit ? ` ${ctrl.unit}` : ''}`;

            return (
              <div key={ctrl.key} className="sim-control-row">
                <label htmlFor={inputId} className="sim-label">
                  <span>{ctrl.label}</span>
                  <span className="sim-val">{displayVal}</span>
                </label>

                {ctrl.kind === 'range' && (
                  <input
                    id={inputId}
                    type="range"
                    min={ctrl.min ?? 0}
                    max={ctrl.max ?? 100}
                    step={ctrl.step ?? 1}
                    value={Number(val)}
                    onChange={(e) => {
                      trackInteract();
                      setValues((prev) => ({
                        ...prev,
                        [ctrl.key]: Number(e.target.value),
                      }));
                    }}
                    className="sim-range"
                  />
                )}

                {ctrl.kind === 'toggle' && (() => {
                  const isOn = Boolean(val);
                  return (
                    <button
                      id={inputId}
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      onClick={() => {
                        trackInteract();
                        setValues((prev) => ({
                          ...prev,
                          [ctrl.key]: !Boolean(prev[ctrl.key]),
                        }));
                      }}
                      className={`sim-toggle ${isOn ? 'on' : 'off'}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 10px 4px 6px',
                        borderRadius: '999px',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'relative',
                          width: '30px',
                          height: '16px',
                          borderRadius: '999px',
                          background: isOn ? 'var(--ok)' : 'var(--border)',
                          transition: 'background 150ms ease',
                          display: 'inline-block',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: isOn ? '16px' : '2px',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            transition: 'left 150ms ease',
                          }}
                        />
                      </span>
                      <span>
                        {isOn ? UI_STRINGS.controls.enabled : UI_STRINGS.controls.disabled}
                      </span>
                    </button>
                  );
                })()}

                {ctrl.kind === 'select' && ctrl.options && (
                  <select
                    id={inputId}
                    value={String(val)}
                    onChange={(e) => {
                      trackInteract();
                      setValues((prev) => ({ ...prev, [ctrl.key]: e.target.value }));
                    }}
                    className="sim-select"
                  >
                    {ctrl.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <div className="live-sandbox-stage">
          <div className="live-sandbox-frame-wrap">
            <div className="live-sandbox-frame-bar">
              <span className="live-sandbox-frame-label">Live Engine Output</span>
              <span className="live-sandbox-frame-policy">
                sandbox=&quot;{SANDBOX_IFRAME_POLICY}&quot;
              </span>
            </div>
            <iframe
              title={`${config.title} live preview`}
              sandbox={SANDBOX_IFRAME_POLICY}
              srcDoc={srcDoc}
              className="live-sandbox-iframe"
              data-testid="live-sandbox-iframe"
              style={{ height: `${config.height ?? 260}px` }}
            />
          </div>

          <div
            className="live-sandbox-observation"
            role="note"
            data-testid="live-sandbox-observation"
          >
            <span className="live-sandbox-observation-title">What to observe</span>
            {config.expectedObservation}
          </div>
        </div>
      </div>
    </section>
  );
}
