'use client';

import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ConstraintSimulatorLabConfig } from '@/lib/schemas';
import { UI_STRINGS } from '@/lib/ui-strings';

type ControlValues = Record<string, number | boolean | string>;
type SimStatus = 'ok' | 'warn' | 'danger';

function getInitialValues(config: ConstraintSimulatorLabConfig): ControlValues {
  const init: ControlValues = {};
  for (const c of config.controls) {
    init[c.key] = c.defaultValue;
  }
  return init;
}

export function computeSimulation(
  mode: ConstraintSimulatorLabConfig['presetMode'],
  values: ControlValues
): {
  metrics: Array<{ label: string; value: string; status?: SimStatus }>;
  summary: string;
  status: SimStatus;
} {
  if (mode === 'stacking-context') {
    const opacity = Number(values.opacity ?? 1);
    const transform = Boolean(values.transform ?? false);
    const zIndex = Number(values.zIndex ?? 10);
    const isolated = opacity < 1 || transform;
    return {
      metrics: [
        {
          label: 'New Stacking Context',
          value: isolated ? 'YES (isolated)' : 'NO (root)',
          status: isolated ? 'warn' : 'ok',
        },
        {
          label: 'Effective child z-index',
          value: isolated ? `Bounded to parent (9999 < ${zIndex})` : '9999 (global)',
          status: isolated ? 'danger' : 'ok',
        },
        {
          label: 'GPU Compositor Layer',
          value: transform || opacity < 1 ? 'Promoted' : 'None',
          status: 'ok',
        },
      ],
      summary: isolated
        ? `opacity: ${opacity} or active transform creates a stacking context: the child's z-index: 9999 cannot escape above a sibling of the parent.`
        : 'No intermediate stacking context: the child z-index: 9999 participates in the root context.',
      status: isolated ? 'danger' : 'ok',
    };
  }

  if (mode === 'layout-thrashing') {
    const items = Number(values.items ?? 50);
    const batched = Boolean(values.batched ?? false);
    const reflows = batched ? 1 : items;
    const estMs = (reflows * 0.45).toFixed(1);
    const budgetStatus: SimStatus =
      Number(estMs) > 16.6 ? 'danger' : Number(estMs) > 8 ? 'warn' : 'ok';
    return {
      metrics: [
        {
          label: 'Layout Recalculations (Reflows)',
          value: `${reflows} / frame`,
          status: reflows > 1 ? 'danger' : 'ok',
        },
        {
          label: 'Estimated Main Thread Time',
          value: `${estMs} ms`,
          status: budgetStatus,
        },
        {
          label: '60 FPS Budget (16.6ms)',
          value: Number(estMs) > 16.6 ? 'EXCEEDED (jank)' : 'Within budget',
          status: Number(estMs) > 16.6 ? 'danger' : 'ok',
        },
      ],
      summary: batched
        ? `Reads batched before writes: 1 single layout pass for ${items} elements.`
        : `Interleaved read/write in loop: ${items} forced synchronous layout invalidations (${estMs} ms).`,
      status: reflows > 1 ? (Number(estMs) > 16.6 ? 'danger' : 'warn') : 'ok',
    };
  }

  if (mode === 'container-query') {
    const width = Number(values.containerWidth ?? 420);
    const useContainer = Boolean(values.useContainer ?? true);
    const cols = useContainer ? (width >= 480 ? 3 : width >= 300 ? 2 : 1) : 3;
    const overflowRisk = !useContainer && width < 320;
    return {
      metrics: [
        { label: 'Container Width', value: `${width} px`, status: 'ok' },
        {
          label: 'Grid Columns',
          value: `${cols} col.`,
          status: overflowRisk ? 'danger' : 'ok',
        },
        {
          label: 'Reference Query',
          value: useContainer ? '@container (inline-size)' : '@media (viewport)',
          status: useContainer ? 'ok' : 'warn',
        },
      ],
      summary: useContainer
        ? `Component adapts to its container (${width}px for ${cols} column(s)), independent of the viewport.`
        : 'Without @container, the grid stays locked to viewport width and overflows narrow sidebars.',
      status: overflowRisk ? 'danger' : useContainer ? 'ok' : 'warn',
    };
  }

  if (mode === 'composite-layers') {
    const count = Number(values.layers ?? 10);
    const willChange = Boolean(values.willChange ?? false);
    const vramMb = (count * (willChange ? 2.4 : 0.4)).toFixed(1);
    const layerStatus: SimStatus =
      willChange && count > 25 ? 'danger' : willChange && count >= 12 ? 'warn' : 'ok';
    const vramStatus: SimStatus =
      Number(vramMb) > 40 ? 'danger' : Number(vramMb) > 20 ? 'warn' : 'ok';
    const overallStatus: SimStatus =
      layerStatus === 'danger' || vramStatus === 'danger'
        ? 'danger'
        : layerStatus === 'warn' || vramStatus === 'warn'
          ? 'warn'
          : 'ok';
    return {
      metrics: [
        {
          label: 'Allocated GPU Layers',
          value: `${willChange ? count : 1}`,
          status: layerStatus,
        },
        {
          label: 'Estimated VRAM',
          value: `${vramMb} MB`,
          status: vramStatus,
        },
      ],
      summary: willChange
        ? count >= 12
          ? `${count} layers allocated: risk of mobile VRAM saturation (${vramMb} MB held even when idle).`
          : `${count} GPU textures held in video memory even when idle (${vramMb} MB).`
        : 'Promoted only during active transitions: minimal VRAM footprint.',
      status: overallStatus,
    };
  }

  if (mode === 'brotli-dictionary') {
    const quality = Number(values.brotliQuality ?? 5);
    const useDict = Boolean(values.useSharedDictionary ?? true);
    const kind = String(values.payloadKind ?? 'static-js-bundle');
    const isDynamic = kind === 'dynamic-ssr-html';
    const rawKb = isDynamic ? 96 : 420;
    const gzipKb = Math.round(rawKb * (isDynamic ? 0.24 : 0.31));
    const qualityFactor = 0.29 - (quality - 1) * 0.0085;
    const brKb = Math.max(8, Math.round(rawKb * qualityFactor));
    const wireKb = useDict
      ? Math.max(4, Math.round(brKb * (isDynamic ? 0.34 : 0.14)))
      : brKb;
    // Compression CPU cost rises non-linearly above quality 6
    const cpuMs = Number(
      ((isDynamic ? 0.6 : 1.9) * Math.pow(1.48, quality - 1) * (useDict ? 1.15 : 1)).toFixed(1)
    );
    const ttfbRisk = isDynamic && quality >= 8;
    const cpuStatus: SimStatus = ttfbRisk ? 'danger' : isDynamic && quality >= 6 ? 'warn' : 'ok';
    const savingsPct = Math.round((1 - wireKb / gzipKb) * 100);
    return {
      metrics: [
        {
          label: 'Wire Payload',
          value: `${wireKb} KB (${useDict ? 'dcb' : 'br'})`,
          status: useDict ? 'ok' : 'warn',
        },
        {
          label: 'vs Gzip Baseline',
          value: `${gzipKb} KB (−${savingsPct}%)`,
          status: savingsPct >= 40 ? 'ok' : 'warn',
        },
        {
          label: isDynamic ? 'Per-Request CPU Time' : 'Build-Time Compression',
          value: `${cpuMs} ms`,
          status: cpuStatus,
        },
      ],
      summary: ttfbRisk
        ? `Brotli quality ${quality} on dynamic SSR HTML stalls TTFB by ${cpuMs} ms per request. Cap on-the-fly Brotli at q=4–5 and reserve q=11 for pre-compressed static assets.`
        : useDict
          ? `Shared Dictionary (dcb) transmits only the delta (${wireKb} KB vs ${brKb} KB standalone Brotli), cutting ${savingsPct}% off Gzip wire bytes.`
          : `Standalone Brotli q=${quality} compresses ${rawKb} KB to ${wireKb} KB. Enabling a prior-version dictionary removes unchanged chunks from the wire.`,
      status: ttfbRisk ? 'danger' : cpuStatus === 'warn' ? 'warn' : 'ok',
    };
  }

  if (mode === 'inp-budget') {
    const inputDelay = Number(values.inputDelayMs ?? 30);
    const rawHandler = Number(values.handlerDurationMs ?? 45);
    const yieldBeforeRender = Boolean(values.yieldBeforeRender ?? true);
    const processingBeforePaint = yieldBeforeRender
      ? Math.max(8, Math.round(rawHandler * 0.38))
      : rawHandler;
    const presentationDelay = yieldBeforeRender ? 16 : Math.round(16 + rawHandler * 0.22);
    const totalInp = inputDelay + processingBeforePaint + presentationDelay;
    const rating: SimStatus = totalInp > 500 ? 'danger' : totalInp > 200 ? 'warn' : 'ok';
    const ratingLabel = totalInp > 500 ? 'Poor (>500ms)' : totalInp > 200 ? 'Needs Improvement' : 'Good (<=200ms)';
    return {
      metrics: [
        { label: 'Total INP', value: `${totalInp} ms`, status: rating },
        {
          label: 'Pre-Paint Processing',
          value: `${processingBeforePaint} ms`,
          status: processingBeforePaint > 100 ? 'danger' : processingBeforePaint > 50 ? 'warn' : 'ok',
        },
        { label: 'CWV Classification', value: ratingLabel, status: rating },
      ],
      summary:
        totalInp <= 200
          ? `INP stays within the 200 ms Good threshold (${inputDelay}ms input + ${processingBeforePaint}ms handler + ${presentationDelay}ms presentation).`
          : yieldBeforeRender
            ? `Even with scheduler.yield(), ${inputDelay}ms queued input delay pushes total INP to ${totalInp}ms. Break up background tasks before the click arrives.`
            : `Full ${rawHandler}ms handler runs synchronously before paint, pushing INP to ${totalInp}ms. Yielding non-urgent work lets the browser commit the visual update earlier.`,
      status: rating,
    };
  }

  if (mode === 'long-task-inp') {
    const bgTask = Number(values.backgroundTaskMs ?? 120);
    const handlerMs = Number(values.handlerMs ?? 45);
    const yieldEnabled = Boolean(values.yieldEnabled ?? false);
    const effectiveInputDelay = yieldEnabled
      ? Math.min(bgTask, 40)
      : Math.round(bgTask * 0.75);
    const presentationMs = 16;
    const totalInp = effectiveInputDelay + handlerMs + presentationMs;
    const isLongTask = !yieldEnabled && bgTask > 50;
    const inpStatus: SimStatus = totalInp > 200 ? 'danger' : totalInp > 120 ? 'warn' : 'ok';
    return {
      metrics: [
        {
          label: 'Input Delay (Blocked)',
          value: `${effectiveInputDelay} ms`,
          status: effectiveInputDelay > 80 ? 'danger' : effectiveInputDelay > 50 ? 'warn' : 'ok',
        },
        {
          label: 'Total INP',
          value: `${totalInp} ms`,
          status: inpStatus,
        },
        {
          label: 'Long Task (>50ms)',
          value: isLongTask ? `YES (${bgTask} ms)` : 'Chunked (<=50ms)',
          status: isLongTask ? 'danger' : 'ok',
        },
      ],
      summary: yieldEnabled
        ? `Yielding every ~40 ms caps input delay at ${effectiveInputDelay} ms, keeping total INP at ${totalInp} ms.`
        : `A ${bgTask} ms unchunked task blocks the main thread; an interaction arriving mid-task waits ${effectiveInputDelay} ms before its handler even starts (INP ${totalInp} ms).`,
      status: inpStatus,
    };
  }

  if (mode === 'cross-origin-isolation') {
    const coop = String(values.coopHeader ?? 'same-origin');
    const coep = String(values.coepHeader ?? 'require-corp');
    const subresourceCorp = Boolean(values.subresourceCorp ?? true);
    const isolated =
      coop === 'same-origin' && (coep === 'require-corp' || coep === 'credentialless');
    const subresourceBlocked = coep === 'require-corp' && !subresourceCorp;
    const subresourceState = subresourceBlocked
      ? 'BLOCKED (ERR_BLOCKED_BY_RESPONSE)'
      : coep === 'credentialless' && !subresourceCorp
        ? 'Loaded (no cookies/creds)'
        : 'Allowed';
    const overallStatus: SimStatus = subresourceBlocked
      ? 'danger'
      : isolated
        ? 'ok'
        : 'warn';
    return {
      metrics: [
        {
          label: 'window.crossOriginIsolated',
          value: isolated ? 'true' : 'false',
          status: isolated ? 'ok' : 'warn',
        },
        {
          label: 'SharedArrayBuffer / 5us Timer',
          value: isolated ? 'Unlocked' : 'Disabled',
          status: isolated ? 'ok' : 'warn',
        },
        {
          label: '3P Subresource Load',
          value: subresourceState,
          status: subresourceBlocked ? 'danger' : 'ok',
        },
      ],
      summary: subresourceBlocked
        ? 'COEP require-corp isolates the browsing context, but blocks any third-party asset missing Cross-Origin-Resource-Policy or CORS headers.'
        : isolated
          ? `COOP: ${coop} + COEP: ${coep} enables crossOriginIsolated=true, unlocking SharedArrayBuffer and high-resolution timers.`
          : `crossOriginIsolated remains false: both COOP: same-origin and COEP: require-corp (or credentialless) are required simultaneously.`,
      status: overallStatus,
    };
  }

  if (mode === 'event-coalescing') {
    const strategy = String(values.strategy ?? 'raf-coalesce');
    const burstHz = Number(values.inputBurstHz ?? 120);
    const cancelOnUnmount = Boolean(values.cancelOnUnmount ?? true);
    const invocationsPerSec =
      strategy === 'raf-coalesce'
        ? Math.min(burstHz, 60)
        : strategy === 'throttle-100ms'
          ? 10
          : 1;
    const reductionPct = Math.round((1 - invocationsPerSec / burstHz) * 100);
    const maxVisualLatency =
      strategy === 'raf-coalesce'
        ? '16.7 ms (1 frame)'
        : strategy === 'throttle-100ms'
          ? '100 ms'
          : '300 ms post-idle';
    const leakStatus: SimStatus = !cancelOnUnmount ? 'danger' : 'ok';
    return {
      metrics: [
        {
          label: 'Handler Runs / 1s Burst',
          value: `${invocationsPerSec} (from ${burstHz} raw)`,
          status: 'ok',
        },
        {
          label: 'Work Eliminated',
          value: `${reductionPct}%`,
          status: reductionPct >= 50 ? 'ok' : 'warn',
        },
        {
          label: 'Visual Update Latency',
          value: maxVisualLatency,
          status: strategy === 'debounce-300ms' ? 'warn' : 'ok',
        },
      ],
      summary: !cancelOnUnmount
        ? `Pending timer/rAF callback is not cancelled on unmount: trailing invocation will fire on a detached component or stale DOM reference.`
        : strategy === 'raf-coalesce'
          ? `Coalesces ${burstHz} Hz pointer bursts to 1 update per 60 Hz VSync frame (${invocationsPerSec}/s), avoiding wasted off-frame layouts.`
          : strategy === 'throttle-100ms'
            ? `Caps execution at 10 Hz (${invocationsPerSec}/s) during continuous bursts; suited for analytics or scroll spy, too coarse for 60 FPS animation.`
            : `Suppresses all ${burstHz} burst events until 300 ms of silence (1 final run); ideal for search API calls, unsuitable for live drag feedback.`,
      status: leakStatus === 'danger' ? 'danger' : strategy === 'debounce-300ms' ? 'warn' : 'ok',
    };
  }

  if (mode === 'memory-retainers') {
    const listeners = Number(values.leakedListeners ?? 10);
    const sharedContext = Boolean(values.sharedContext ?? true);
    const useWeakMap = Boolean(values.useWeakMap ?? false);
    const baseSubtreeMb = 1.6;
    const closureBufferMb = sharedContext ? 4.2 : 0.4;
    const metadataFactor = useWeakMap ? 0.55 : 1.0;
    const retainedMb = Number(
      (listeners * (baseSubtreeMb + closureBufferMb) * metadataFactor).toFixed(1)
    );
    const detachedNodes = listeners * 85;
    const status: SimStatus = retainedMb > 45 ? 'danger' : retainedMb > 15 ? 'warn' : 'ok';
    return {
      metrics: [
        {
          label: 'Retained Heap',
          value: `${retainedMb} MB`,
          status,
        },
        {
          label: 'Pinned Detached Nodes',
          value: `${detachedNodes.toLocaleString('en-US')}`,
          status: detachedNodes > 1000 ? 'danger' : detachedNodes > 0 ? 'warn' : 'ok',
        },
        {
          label: 'GC Reclaimable',
          value: listeners === 0 ? '100% (clean)' : useWeakMap ? 'Metadata only' : 'Blocked by root',
          status: listeners === 0 ? 'ok' : status,
        },
      ],
      summary:
        listeners === 0
          ? 'All global listeners removed on teardown: detached DOM trees and closure contexts are unreachable from GC roots and collected.'
          : sharedContext
            ? `${listeners} uncleaned global listeners pin ${detachedNodes} detached nodes and a shared V8 Context holding ${retainedMb} MB. ${useWeakMap ? 'WeakMap frees metadata entries, but global listeners still anchor the DOM roots.' : 'Replacing strong Maps with WeakMap and removing listeners breaks the retainer path.'}`
            : `${listeners} uncleaned global listeners pin ${detachedNodes} detached DOM nodes (${retainedMb} MB) because window holds a strong reference to each callback.`,
      status,
    };
  }

  if (mode === 'streams-backpressure') {
    const hwm = Number(values.highWaterMark ?? 64);
    const chunkSize = Number(values.chunkSize ?? 16);
    const respectBp = Boolean(values.respectBackpressure ?? true);
    const consumerDrainPerTick = 16;
    const ticks = 24;
    const netGrowthPerTick = Math.max(0, chunkSize - consumerDrainPerTick);
    const peakQueueKb = respectBp
      ? Math.min(hwm + chunkSize, Math.max(chunkSize, hwm))
      : Math.max(chunkSize, chunkSize + netGrowthPerTick * ticks);
    const desiredSize = hwm - peakQueueKb;
    const oomRisk = !respectBp && peakQueueKb > hwm * 2;
    const status: SimStatus = oomRisk ? 'danger' : desiredSize <= 0 ? 'warn' : 'ok';
    return {
      metrics: [
        {
          label: 'Peak Queued Buffer',
          value: `${peakQueueKb} KB`,
          status,
        },
        {
          label: 'controller.desiredSize',
          value: `${desiredSize} KB`,
          status: desiredSize <= 0 ? (respectBp ? 'warn' : 'danger') : 'ok',
        },
        {
          label: 'Producer State',
          value: !respectBp
            ? 'Unbounded Push'
            : desiredSize <= 0
              ? 'Paused (Backpressure)'
              : 'Flowing',
          status: oomRisk ? 'danger' : 'ok',
        },
      ],
      summary: respectBp
        ? `Producer checks controller.desiredSize <= 0 and pauses once queue reaches ${hwm} KB highWaterMark, bounding memory to ${peakQueueKb} KB.`
        : `Ignoring negative desiredSize (${desiredSize} KB) lets the faster producer (${chunkSize} KB/tick vs 16 KB/tick consumer) accumulate ${peakQueueKb} KB in RAM.`,
      status,
    };
  }

  if (mode === 'virtualized-list') {
    const totalRows = Number(values.totalRows ?? 10000);
    const overscan = Number(values.overscanCount ?? 5);
    const windowing = Boolean(values.windowingEnabled ?? true);
    const visibleRows = 15;
    const mountedRows = windowing
      ? Math.min(totalRows, visibleRows + overscan * 2)
      : totalRows;
    const domNodes = mountedRows * 6;
    const layoutMs = Number((domNodes * 0.0085).toFixed(1));
    const domMemMb = Number(((domNodes * 0.9) / 1024).toFixed(2));
    const status: SimStatus = layoutMs > 50 ? 'danger' : layoutMs > 16.6 ? 'warn' : 'ok';
    return {
      metrics: [
        {
          label: 'Mounted DOM Nodes',
          value: domNodes.toLocaleString('en-US'),
          status,
        },
        {
          label: 'Estimated Layout Cost',
          value: `${layoutMs} ms`,
          status,
        },
        {
          label: 'DOM Node Memory',
          value: `${domMemMb} MB`,
          status: domMemMb > 20 ? 'danger' : domMemMb > 5 ? 'warn' : 'ok',
        },
      ],
      summary: windowing
        ? `Viewport windowing mounts only ${mountedRows} of ${totalRows.toLocaleString('en-US')} rows (${visibleRows} visible + ${overscan * 2} overscan), keeping layout O(1) at ${layoutMs} ms.`
        : `Full DOM mount inserts ${domNodes.toLocaleString('en-US')} nodes for ${totalRows.toLocaleString('en-US')} rows, stalling style/layout for ${layoutMs} ms (${domMemMb} MB DOM heap).`,
      status,
    };
  }

  const exhaustiveCheck: never = mode;
  throw new Error(`Unhandled ConstraintSimulatorLab presetMode: ${String(exhaustiveCheck)}`);
}

const INTERPRETATION_STYLES: Record<
  SimStatus,
  { border: string; background: string; color: string }
> = {
  ok: {
    border: '1px solid rgba(34, 197, 94, 0.4)',
    background: 'rgba(34, 197, 94, 0.08)',
    color: '#86efac',
  },
  warn: {
    border: '1px solid rgba(245, 158, 11, 0.45)',
    background: 'rgba(245, 158, 11, 0.1)',
    color: '#fcd34d',
  },
  danger: {
    border: '1px solid rgba(239, 68, 68, 0.5)',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#fca5a5',
  },
};

export function ConstraintSimulatorLab({
  config,
  headerExtra,
}: {
  config: ConstraintSimulatorLabConfig;
  headerExtra?: React.ReactNode;
}) {
  const [values, setValues] = useState<ControlValues>(() => getInitialValues(config));

  const sim = useMemo(() => computeSimulation(config.presetMode, values), [config.presetMode, values]);

  const handleReset = () => setValues(getInitialValues(config));

  return (
    <section
      className="lab-card"
      data-testid="lab-constraint-simulator"
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
            aria-label="Reset parameters"
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
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [ctrl.key]: Number(e.target.value) }))
                    }
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
                      onClick={() =>
                        setValues((prev) => ({ ...prev, [ctrl.key]: !Boolean(prev[ctrl.key]) }))
                      }
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
                      <span>{isOn ? UI_STRINGS.controls.enabled : UI_STRINGS.controls.disabled}</span>
                    </button>
                  );
                })()}

                {ctrl.kind === 'select' && ctrl.options && (
                  <select
                    id={inputId}
                    value={String(val)}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [ctrl.key]: e.target.value }))
                    }
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

        <div className="sim-output">
          <SimulatorVisualStage
            mode={config.presetMode}
            values={values}
            metrics={sim.metrics}
          />
          <div className="sim-metrics">
            {sim.metrics.map((m) => (
              <div key={m.label} className={`sim-metric sim-metric-${m.status ?? 'ok'}`}>
                <div className="sim-metric-label">{m.label}</div>
                <div className="sim-metric-value">{m.value}</div>
              </div>
            ))}
          </div>
          <div
            className="sim-summary"
            role="status"
            aria-live="polite"
            data-testid="sim-interpretation"
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 500,
              ...INTERPRETATION_STYLES[sim.status],
            }}
          >
            {sim.summary}
          </div>
          {(config.presetMode === 'stacking-context' ||
            config.presetMode === 'container-query' ||
            config.presetMode === 'layout-thrashing' ||
            config.presetMode === 'composite-layers') && (
            <div
              data-testid="sim-sandbox"
              style={{
                marginTop: '12px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px dashed var(--border)',
                background: '#090b0f',
                fontSize: '0.8rem',
              }}
            >
              {config.presetMode === 'stacking-context' && (
                <div style={{ position: 'relative', height: '76px' }}>
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      opacity: Number(values.opacity ?? 1),
                      transform: Boolean(values.transform ?? false) ? 'translateZ(0)' : undefined,
                      background: 'rgba(56, 189, 248, 0.14)',
                      border: '1px solid #38bdf8',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      width: '68%',
                    }}
                  >
                    Parent (z: 1)
                    <div
                      style={{
                        position: 'relative',
                        zIndex: 9999,
                        marginTop: '4px',
                        background: '#1e293b',
                        border: '1px solid #60a5fa',
                        borderRadius: '4px',
                        padding: '3px 8px',
                      }}
                    >
                      Child modal (z-index: 9999)
                    </div>
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '18px',
                      zIndex: Number(values.zIndex ?? 10),
                      background: 'rgba(251, 113, 133, 0.9)',
                      color: '#090b0f',
                      fontWeight: 700,
                      padding: '8px 12px',
                      borderRadius: '6px',
                    }}
                  >
                    Sibling Header (z: {String(values.zIndex ?? 10)})
                  </div>
                </div>
              )}

              {config.presetMode === 'container-query' && (
                <div
                  style={{
                    width: `${Math.min(100, Math.round((Number(values.containerWidth ?? 420) / 640) * 100))}%`,
                    border: '1px solid #a78bfa',
                    borderRadius: '6px',
                    padding: '8px',
                    transition: 'width 150ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: '6px',
                      gridTemplateColumns: `repeat(${
                        Boolean(values.useContainer ?? true)
                          ? Number(values.containerWidth ?? 420) >= 480
                            ? 3
                            : Number(values.containerWidth ?? 420) >= 300
                              ? 2
                              : 1
                          : 3
                      }, minmax(0, 1fr))`,
                    }}
                  >
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        style={{
                          background: 'rgba(167, 139, 250, 0.16)',
                          border: '1px solid rgba(167, 139, 250, 0.4)',
                          borderRadius: '4px',
                          padding: '4px',
                          textAlign: 'center',
                        }}
                      >
                        Card {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {config.presetMode === 'layout-thrashing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Frame Budget (16.6 ms)</span>
                    <span>{((Boolean(values.batched ?? false) ? 1 : Number(values.items ?? 50)) * 0.45).toFixed(1)} ms</span>
                  </div>
                  <div style={{ height: '10px', background: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(
                          100,
                          Math.round((((Boolean(values.batched ?? false) ? 1 : Number(values.items ?? 50)) * 0.45) / 16.6) * 100)
                        )}%`,
                        background:
                          (Boolean(values.batched ?? false) ? 1 : Number(values.items ?? 50)) * 0.45 > 16.6
                            ? '#f87171'
                            : '#34d399',
                        transition: 'width 150ms ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {config.presetMode === 'composite-layers' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Array.from({ length: Math.min(24, Number(values.layers ?? 10)) }).map((_, idx) => (
                    <span
                      key={idx}
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '3px',
                        background: Boolean(values.willChange ?? false) ? '#f59e0b' : '#334155',
                        border: '1px solid rgba(255,255,255,0.12)',
                      }}
                      title={Boolean(values.willChange ?? false) ? 'Promoted GPU Texture' : 'Shared Layer'}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SimulatorVisualStage({
  mode,
  values,
}: {
  mode: ConstraintSimulatorLabConfig['presetMode'];
  values: ControlValues;
  metrics: Array<{ label: string; value: string; status?: SimStatus }>;
}) {
  if (mode === 'stacking-context') {
    const opacity = Number(values.opacity ?? 1);
    const transform = Boolean(values.transform ?? false);
    const zIndex = Number(values.zIndex ?? 10);
    const isolated = opacity < 1 || transform;

    return (
      <div className="sim-visual-stage" aria-label="Z-order layer diagram">
        <div className="sim-stage-head">
          <span className="sim-stage-title">Z-Order Paint Stack</span>
          <span className={`sim-stage-pill ${isolated ? 'sim-stage-pill-danger' : 'sim-stage-pill-ok'}`}>
            {isolated ? 'Trapped in Parent Context' : 'Root Stacking Context'}
          </span>
        </div>

        <div className="stack-stage">
          <div
            className={`stack-layer stack-layer-header ${isolated ? 'stack-layer-top' : 'stack-layer-mid'}`}
            style={{
              transform: isolated ? 'translateY(0px)' : 'translateY(44px)',
            }}
          >
            <span className="stack-layer-badge">z-index: {zIndex}</span>
            <span className="stack-layer-name">Sticky Header (sibling)</span>
            <span className="stack-layer-state">
              {isolated ? 'Painted above modal' : 'Behind modal'}
            </span>
          </div>

          <div
            className={`stack-parent-box ${isolated ? 'stack-parent-isolated' : 'stack-parent-root'}`}
            style={{
              transform: isolated ? 'translateY(44px)' : 'translateY(0px)',
              opacity: Math.max(0.55, opacity),
            }}
          >
            <div className="stack-parent-meta">
              <span>Parent (z: 1)</span>
              <span className="stack-boundary-tag">
                {isolated
                  ? `Isolation boundary (${opacity < 1 ? `opacity: ${opacity}` : 'transform'})`
                  : 'No isolation boundary'}
              </span>
            </div>
            <div
              className={`stack-layer stack-layer-modal ${isolated ? 'stack-layer-trapped' : 'stack-layer-elevated'}`}
            >
              <span className="stack-layer-badge">z-index: 9999</span>
              <span className="stack-layer-name">Child Modal</span>
              <span className="stack-layer-state">
                {isolated ? 'Trapped' : 'Elevated'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'layout-thrashing') {
    const items = Number(values.items ?? 50);
    const batched = Boolean(values.batched ?? false);
    const reflows = batched ? 1 : items;
    const estMs = Number((reflows * 0.45).toFixed(1));
    const maxScaleMs = 30;
    const fillPct = Math.min(100, Math.round((estMs / maxScaleMs) * 100));
    const thresholdPct = Math.round((16.6 / maxScaleMs) * 100);
    const budgetStatus: SimStatus = estMs > 16.6 ? 'danger' : estMs > 8 ? 'warn' : 'ok';
    const visibleSpikes = Math.min(12, Math.max(2, Math.round(items / 10)));

    return (
      <div className="sim-visual-stage" aria-label="60 FPS frame budget visualization">
        <div className="sim-stage-head">
          <span className="sim-stage-title">60 FPS Frame Budget (16.6ms)</span>
          <span className={`sim-stage-pill sim-stage-pill-${budgetStatus}`}>
            {estMs} ms ({reflows} {reflows === 1 ? 'pass' : 'reflows'})
          </span>
        </div>

        <div className="frame-budget-track">
          <div
            className={`frame-budget-fill frame-budget-${budgetStatus}`}
            style={{ width: `${fillPct}%` }}
          />
          <div
            className="frame-budget-marker"
            style={{ left: `${thresholdPct}%` }}
            title="16.6ms 60 FPS deadline"
          >
            <span className="frame-budget-marker-label">16.6ms</span>
          </div>
        </div>

        <div className="reflow-timeline" aria-hidden="true">
          {batched ? (
            <div className="reflow-batched-row">
              <span className="reflow-block reflow-block-read">Batch Reads ({items})</span>
              <span className="reflow-arrow">→</span>
              <span className="reflow-block reflow-block-layout">1× Layout</span>
              <span className="reflow-arrow">→</span>
              <span className="reflow-block reflow-block-write">Batch Writes ({items})</span>
            </div>
          ) : (
            <div className="reflow-spikes-row">
              {Array.from({ length: visibleSpikes }).map((_, idx) => (
                <span
                  key={idx}
                  className="reflow-spike"
                  style={{ animationDelay: `${idx * 45}ms` }}
                  title="Forced synchronous layout (read → write)"
                >
                  R→W
                </span>
              ))}
              {items > visibleSpikes && (
                <span className="reflow-more">+{items - visibleSpikes} more</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'composite-layers') {
    const count = Number(values.layers ?? 10);
    const willChange = Boolean(values.willChange ?? false);
    const vramMb = Number((count * (willChange ? 2.4 : 0.4)).toFixed(1));
    const vramStatus: SimStatus = vramMb > 40 ? 'danger' : vramMb > 20 ? 'warn' : 'ok';
    const maxVram = 60;
    const vramPct = Math.min(100, Math.round((vramMb / maxVram) * 100));
    const stackCount = willChange ? Math.min(10, Math.max(3, Math.round(count / 6))) : 1;

    return (
      <div className="sim-visual-stage" aria-label="GPU composite layers and VRAM budget">
        <div className="sim-stage-head">
          <span className="sim-stage-title">GPU Texture Stack &amp; VRAM</span>
          <span className={`sim-stage-pill sim-stage-pill-${vramStatus}`}>
            {willChange ? `${count} promoted layers` : '1 shared layer'} · {vramMb} MB
          </span>
        </div>

        <div className="gpu-stage-body">
          <div className="gpu-stack-preview" aria-hidden="true">
            {Array.from({ length: stackCount }).map((_, idx) => (
              <div
                key={idx}
                className={`gpu-layer-card ${willChange ? 'gpu-layer-promoted' : 'gpu-layer-shared'}`}
                style={{
                  transform: willChange
                    ? `translate(${idx * 6}px, ${-idx * 3}px)`
                    : 'translate(0, 0)',
                  zIndex: idx + 1,
                }}
              >
                {idx === stackCount - 1 && (
                  <span>{willChange ? `Layer ×${count}` : 'Shared Layer'}</span>
                )}
              </div>
            ))}
          </div>

          <div className="vram-meter-wrap">
            <div className="vram-meter-labels">
              <span>VRAM Budget</span>
              <span>{vramMb} / {maxVram} MB</span>
            </div>
            <div className="vram-meter-track">
              <div
                className={`vram-meter-fill vram-meter-${vramStatus}`}
                style={{ width: `${vramPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'container-query') {
    const width = Number(values.containerWidth ?? 420);
    const useContainer = Boolean(values.useContainer ?? true);
    const cols = useContainer ? (width >= 480 ? 3 : width >= 300 ? 2 : 1) : 3;
    const overflowRisk = !useContainer && width < 320;
    const widthPct = Math.min(100, Math.max(28, Math.round((width / 640) * 100)));

    return (
      <div className="sim-visual-stage" aria-label="Resizable container query preview">
        <div className="sim-stage-head">
          <span className="sim-stage-title">
            {useContainer ? '@container (inline-size)' : '@media (viewport)'}
          </span>
          <span className={`sim-stage-pill ${overflowRisk ? 'sim-stage-pill-danger' : 'sim-stage-pill-ok'}`}>
            {width}px → {cols} {cols === 1 ? 'col' : 'cols'}
            {overflowRisk ? ' (Overflow)' : ''}
          </span>
        </div>

        <div className="cq-frame-outer">
          <div
            className={`cq-frame-inner ${overflowRisk ? 'cq-frame-overflow' : ''}`}
            style={{ width: `${widthPct}%` }}
          >
            <div
              className="cq-grid"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {[1, 2, 3].map((item) => (
                <div key={item} className="cq-card">
                  Card {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'brotli-dictionary') {
    const quality = Number(values.brotliQuality ?? 5);
    const useDict = Boolean(values.useSharedDictionary ?? true);
    const isDynamic = String(values.payloadKind ?? 'static-js-bundle') === 'dynamic-ssr-html';
    const rawKb = isDynamic ? 96 : 420;
    const gzipKb = Math.round(rawKb * (isDynamic ? 0.24 : 0.31));
    const brKb = Math.max(8, Math.round(rawKb * (0.29 - (quality - 1) * 0.0085)));
    const wireKb = useDict ? Math.max(4, Math.round(brKb * (isDynamic ? 0.34 : 0.14))) : brKb;
    const bars: Array<{ label: string; kb: number; status: SimStatus }> = [
      { label: 'Uncompressed', kb: rawKb, status: 'danger' },
      { label: 'Gzip (q=6)', kb: gzipKb, status: 'warn' },
      { label: `Brotli (q=${quality})`, kb: brKb, status: 'ok' },
      { label: useDict ? 'Brotli + Shared Dict (dcb)' : 'Active Wire Output', kb: wireKb, status: 'ok' },
    ];
    return (
      <div className="sim-visual-stage" aria-label="Compression payload comparison">
        <div className="sim-stage-head">
          <span className="sim-stage-title">Wire Transfer Size Comparison</span>
          <span className="sim-stage-pill sim-stage-pill-ok">{wireKb} KB sent</span>
        </div>
        <div className="generic-bars">
          {bars.map((b) => (
            <div key={b.label} className="generic-bar-row">
              <div className="generic-bar-meta">
                <span>{b.label}</span>
                <span>{b.kb} KB</span>
              </div>
              <div className="generic-bar-track">
                <div
                  className={`generic-bar-fill generic-bar-${b.status}`}
                  style={{ width: `${Math.max(4, Math.round((b.kb / rawKb) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'inp-budget' || mode === 'long-task-inp') {
    const isLongTask = mode === 'long-task-inp';
    const inputDelay = isLongTask
      ? Boolean(values.yieldEnabled ?? false)
        ? Math.min(Number(values.backgroundTaskMs ?? 120), 40)
        : Math.round(Number(values.backgroundTaskMs ?? 120) * 0.75)
      : Number(values.inputDelayMs ?? 30);
    const processing = isLongTask
      ? Number(values.handlerMs ?? 45)
      : Boolean(values.yieldBeforeRender ?? true)
        ? Math.max(8, Math.round(Number(values.handlerDurationMs ?? 45) * 0.38))
        : Number(values.handlerDurationMs ?? 45);
    const presentation = isLongTask
      ? 16
      : Boolean(values.yieldBeforeRender ?? true)
        ? 16
        : Math.round(16 + Number(values.handlerDurationMs ?? 45) * 0.22);
    const total = inputDelay + processing + presentation;
    const scaleMax = 500;
    const status: SimStatus = total > 500 ? 'danger' : total > 200 ? 'warn' : 'ok';
    const thresholdPct = Math.round((200 / scaleMax) * 100);
    return (
      <div className="sim-visual-stage" aria-label="INP phase breakdown">
        <div className="sim-stage-head">
          <span className="sim-stage-title">INP Phase Breakdown (200ms Good Target)</span>
          <span className={`sim-stage-pill sim-stage-pill-${status}`}>{total} ms</span>
        </div>
        <div className="frame-budget-track" style={{ display: 'flex' }}>
          <div
            style={{
              width: `${Math.min(100, (inputDelay / scaleMax) * 100)}%`,
              background: '#f59e0b',
              height: '100%',
            }}
            title={`Input delay: ${inputDelay}ms`}
          />
          <div
            style={{
              width: `${Math.min(100, (processing / scaleMax) * 100)}%`,
              background: '#38bdf8',
              height: '100%',
            }}
            title={`Processing: ${processing}ms`}
          />
          <div
            style={{
              width: `${Math.min(100, (presentation / scaleMax) * 100)}%`,
              background: '#a78bfa',
              height: '100%',
            }}
            title={`Presentation: ${presentation}ms`}
          />
          <div
            className="frame-budget-marker"
            style={{ left: `${thresholdPct}%` }}
            title="200ms Good INP threshold"
          >
            <span className="frame-budget-marker-label">200ms</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.74rem', marginTop: '8px', color: 'var(--text-muted)' }}>
          <span><strong style={{ color: '#f59e0b' }}>■</strong> Input Delay {inputDelay}ms</span>
          <span><strong style={{ color: '#38bdf8' }}>■</strong> Handler {processing}ms</span>
          <span><strong style={{ color: '#a78bfa' }}>■</strong> Paint {presentation}ms</span>
        </div>
      </div>
    );
  }

  if (mode === 'cross-origin-isolation') {
    const coop = String(values.coopHeader ?? 'same-origin');
    const coep = String(values.coepHeader ?? 'require-corp');
    const subresourceCorp = Boolean(values.subresourceCorp ?? true);
    const isolated =
      coop === 'same-origin' && (coep === 'require-corp' || coep === 'credentialless');
    const subresourceBlocked = coep === 'require-corp' && !subresourceCorp;
    const rows: Array<{ name: string; state: string; status: SimStatus }> = [
      { name: 'SharedArrayBuffer / Atomics', state: isolated ? 'Available' : 'Blocked', status: isolated ? 'ok' : 'warn' },
      { name: 'Browsing Context Group', state: coop === 'same-origin' ? 'Isolated (opener=null)' : 'Shared', status: coop === 'same-origin' ? 'ok' : 'warn' },
      { name: '3P Subresource (CDN)', state: subresourceBlocked ? 'Blocked by COEP' : coep === 'credentialless' && !subresourceCorp ? 'Credentialless' : 'Loaded', status: subresourceBlocked ? 'danger' : 'ok' },
    ];
    return (
      <div className="sim-visual-stage" aria-label="Cross-origin isolation capability matrix">
        <div className="sim-stage-head">
          <span className="sim-stage-title">Browser Capability Matrix</span>
          <span className={`sim-stage-pill sim-stage-pill-${subresourceBlocked ? 'danger' : isolated ? 'ok' : 'warn'}`}>
            crossOriginIsolated: {isolated ? 'true' : 'false'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map((r) => (
            <div
              key={r.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '6px',
                background: '#090b0f',
                border: '1px solid var(--border)',
                fontSize: '0.78rem',
              }}
            >
              <span>{r.name}</span>
              <span className={`sim-stage-pill sim-stage-pill-${r.status}`}>{r.state}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'event-coalescing') {
    const strategy = String(values.strategy ?? 'raf-coalesce');
    const burstHz = Number(values.inputBurstHz ?? 120);
    const rawTicks = Math.min(24, Math.max(6, Math.round(burstHz / 10)));
    const runTicks =
      strategy === 'raf-coalesce' ? Math.min(12, rawTicks) : strategy === 'throttle-100ms' ? 4 : 1;
    return (
      <div className="sim-visual-stage" aria-label="Event coalescing timeline">
        <div className="sim-stage-head">
          <span className="sim-stage-title">1-Second Input Burst vs Handler Invocations</span>
          <span className="sim-stage-pill sim-stage-pill-ok">{strategy}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.74rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Raw Pointer/Key Events ({burstHz} Hz)</div>
            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
              {Array.from({ length: rawTicks }).map((_, i) => (
                <span key={i} style={{ width: '6px', height: '14px', borderRadius: '2px', background: '#475569' }} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Dispatched Handler Calls</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '14px' }}>
              {Array.from({ length: runTicks }).map((_, i) => (
                <span key={i} style={{ width: '10px', height: '14px', borderRadius: '2px', background: '#38bdf8' }} />
              ))}
              {strategy === 'debounce-300ms' && (
                <span style={{ color: '#fcd34d', fontFamily: 'var(--mono)' }}>← fires 300ms after burst ends</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'memory-retainers') {
    const listeners = Number(values.leakedListeners ?? 10);
    const sharedContext = Boolean(values.sharedContext ?? true);
    const useWeakMap = Boolean(values.useWeakMap ?? false);
    const retainedMb = Number(
      (listeners * (1.6 + (sharedContext ? 4.2 : 0.4)) * (useWeakMap ? 0.55 : 1)).toFixed(1)
    );
    const status: SimStatus = retainedMb > 45 ? 'danger' : retainedMb > 15 ? 'warn' : 'ok';
    const pct = Math.min(100, Math.round((retainedMb / 160) * 100));
    return (
      <div className="sim-visual-stage" aria-label="GC retainer chain and heap pressure">
        <div className="sim-stage-head">
          <span className="sim-stage-title">GC Root Retainer Path</span>
          <span className={`sim-stage-pill sim-stage-pill-${status}`}>{retainedMb} MB retained</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.75rem', fontFamily: 'var(--mono)', marginBottom: '10px' }}>
          <span className="reflow-block reflow-block-read">window (GC Root)</span>
          <span className="reflow-arrow">→</span>
          <span className={`reflow-block ${listeners > 0 ? 'reflow-block-write' : 'reflow-block-layout'}`}>
            Listeners ({listeners})
          </span>
          <span className="reflow-arrow">→</span>
          <span className={`reflow-block ${sharedContext && listeners > 0 ? 'reflow-block-write' : 'reflow-block-layout'}`}>
            {sharedContext ? 'Shared Context + Buffer' : 'Light Closure'}
          </span>
        </div>
        <div className="generic-bar-track">
          <div className={`generic-bar-fill generic-bar-${status}`} style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      </div>
    );
  }

  if (mode === 'streams-backpressure') {
    const hwm = Number(values.highWaterMark ?? 64);
    const chunkSize = Number(values.chunkSize ?? 16);
    const respectBp = Boolean(values.respectBackpressure ?? true);
    const netGrowth = Math.max(0, chunkSize - 16);
    const peakKb = respectBp
      ? Math.min(hwm + chunkSize, Math.max(chunkSize, hwm))
      : Math.max(chunkSize, chunkSize + netGrowth * 24);
    const scaleMax = Math.max(hwm * 2, peakKb, 128);
    const fillPct = Math.min(100, Math.round((peakKb / scaleMax) * 100));
    const hwmPct = Math.min(96, Math.round((hwm / scaleMax) * 100));
    const status: SimStatus = !respectBp && peakKb > hwm * 2 ? 'danger' : peakKb >= hwm ? 'warn' : 'ok';
    return (
      <div className="sim-visual-stage" aria-label="Stream internal queue vs highWaterMark">
        <div className="sim-stage-head">
          <span className="sim-stage-title">Internal Queue vs highWaterMark</span>
          <span className={`sim-stage-pill sim-stage-pill-${status}`}>
            {peakKb} KB / {hwm} KB HWM
          </span>
        </div>
        <div className="frame-budget-track">
          <div className={`frame-budget-fill frame-budget-${status}`} style={{ width: `${fillPct}%` }} />
          <div className="frame-budget-marker" style={{ left: `${hwmPct}%` }} title={`highWaterMark: ${hwm} KB`}>
            <span className="frame-budget-marker-label">HWM</span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'virtualized-list') {
    const totalRows = Number(values.totalRows ?? 10000);
    const overscan = Number(values.overscanCount ?? 5);
    const windowing = Boolean(values.windowingEnabled ?? true);
    const mountedRows = windowing ? Math.min(totalRows, 15 + overscan * 2) : totalRows;
    const mountedPct = Math.max(3, Math.min(100, Math.round((mountedRows / totalRows) * 100)));
    const status: SimStatus = windowing ? 'ok' : totalRows > 2000 ? 'danger' : 'warn';
    return (
      <div className="sim-visual-stage" aria-label="Mounted rows vs dataset size">
        <div className="sim-stage-head">
          <span className="sim-stage-title">DOM Footprint vs Total Dataset</span>
          <span className={`sim-stage-pill sim-stage-pill-${status}`}>
            {mountedRows.toLocaleString('en-US')} / {totalRows.toLocaleString('en-US')} rows mounted
          </span>
        </div>
        <div className="generic-bars">
          <div className="generic-bar-row">
            <div className="generic-bar-meta">
              <span>Dataset Size</span>
              <span>{totalRows.toLocaleString('en-US')} rows</span>
            </div>
            <div className="generic-bar-track">
              <div className="generic-bar-fill generic-bar-warn" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="generic-bar-row">
            <div className="generic-bar-meta">
              <span>Live DOM Rows</span>
              <span>{mountedRows.toLocaleString('en-US')} rows</span>
            </div>
            <div className="generic-bar-track">
              <div className={`generic-bar-fill generic-bar-${status}`} style={{ width: `${mountedPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const exhaustiveCheck: never = mode;
  throw new Error(`Unhandled SimulatorVisualStage presetMode: ${String(exhaustiveCheck)}`);
}
