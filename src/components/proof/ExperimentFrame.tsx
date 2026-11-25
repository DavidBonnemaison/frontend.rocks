'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ExperimentBundle } from '@/lib/proof/experiment-schema';
import {
  mountForBundle,
  notRunnableReason,
  type MountedFrame,
  type RunResult,
} from '@/lib/proof/runtime';

export interface FrameState {
  status: 'waiting-visible' | 'running' | 'ok' | 'error' | 'blocked' | 'not-runnable';
  result: RunResult | null;
  reason: string | null;
}

export interface ExperimentFrameProps {
  bundle: ExperimentBundle;
  variant: 'treatment' | 'control';
  params?: Record<string, number | boolean | string>;
  mutated?: boolean;
  /** When true, the reader can click and type inside the iframe. Declared input is not replayed. */
  interactive?: boolean;
  onState?: (state: FrameState) => void;
  className?: string;
}

const MAX_RAF_RETRIES = 3;
const PARAM_DEBOUNCE_MS = 250;

export function ExperimentFrame({
  bundle,
  variant,
  params,
  mutated = false,
  interactive = false,
  onState,
  className,
}: ExperimentFrameProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  const reason = useMemo(() => notRunnableReason(bundle), [bundle]);
  const staticBlockedReason: string | null =
    reason === 'network-server' || reason === 'engine-console' ? reason : null;
  const caveatReason: string | null =
    staticBlockedReason === null && reason !== null ? reason : null;

  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);
  const [scale, setScale] = useState(1);
  const [everVisible, setEverVisible] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [frameState, setFrameState] = useState<FrameState>({
    status: 'waiting-visible',
    result: null,
    reason: caveatReason,
  });

  const hasMountedOnceRef = useRef(false);
  const rafRetriesRef = useRef(0);
  const needsRetryRef = useRef(false);
  const intersectingRef = useRef(false);

  const effectiveState: FrameState = useMemo(() => {
    if (staticBlockedReason) {
      return { status: 'not-runnable', result: null, reason: staticBlockedReason };
    }
    return frameState;
  }, [staticBlockedReason, frameState]);

  useEffect(() => {
    onStateRef.current?.(effectiveState);
  }, [effectiveState]);

  // Keep the iframe at its declared viewport size and scale the container to fit the host width.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const updateScale = (width: number) => {
      if (width <= 0) return;
      setScale(Math.min(1, width / bundle.viewport.width));
    };
    updateScale(outer.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? outer.clientWidth;
      updateScale(width);
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, [bundle.viewport.width]);

  // Wait until the frame enters the viewport before mounting, and retry after FR_RAF_THROTTLED.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || staticBlockedReason) return;

    const triggerIfNeeded = () => {
      setEverVisible(true);
      if (needsRetryRef.current) {
        needsRetryRef.current = false;
        setRetryToken((n) => n + 1);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && intersectingRef.current) {
        triggerIfNeeded();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (typeof IntersectionObserver === 'undefined') {
      intersectingRef.current = true;
      const t = setTimeout(triggerIfNeeded, 0);
      return () => {
        clearTimeout(t);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        intersectingRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          triggerIfNeeded();
        }
      },
      { threshold: 0 }
    );
    observer.observe(outer);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [staticBlockedReason]);

  // Reset retry counter whenever experiment inputs change.
  useEffect(() => {
    rafRetriesRef.current = 0;
    needsRetryRef.current = false;
  }, [bundle, variant, paramsKey, mutated]);

  // Mount and observe the sandboxed iframe once visible, debouncing param/mutation updates.
  useEffect(() => {
    if (staticBlockedReason || !everVisible) return;
    const host = mountRef.current;
    if (!host) return;

    let cancelled = false;
    let activeFrame: MountedFrame | null = null;
    const delay = hasMountedOnceRef.current && retryToken === 0 ? PARAM_DEBOUNCE_MS : 0;

    const timer = setTimeout(() => {
      if (cancelled) return;
      hasMountedOnceRef.current = true;
      setFrameState({ status: 'running', result: null, reason: caveatReason });

      const parsedParams = JSON.parse(paramsKey) as Record<string, number | boolean | string>;
      mountForBundle(host, {
        bundle,
        variant,
        params: parsedParams,
        mutated,
        awaitInput: false,
      })
        .then(async (mounted) => {
          if (cancelled) {
            mounted.destroy();
            return;
          }
          activeFrame = mounted;
          const result = await mounted.observe();
          if (cancelled) return;

          if (!result.ok) {
            if (/SecurityError|NotAllowedError/.test(result.error)) {
              setFrameState({ status: 'blocked', result, reason: 'storage-blocked' });
              return;
            }
            if (/FR_RAF_THROTTLED/.test(result.error) && rafRetriesRef.current < MAX_RAF_RETRIES) {
              rafRetriesRef.current += 1;
              needsRetryRef.current = true;
              mounted.destroy();
              activeFrame = null;
              setFrameState({ status: 'waiting-visible', result: null, reason: 'raf-throttled' });
              return;
            }
            setFrameState({ status: 'error', result, reason: result.error });
            return;
          }

          setFrameState({ status: 'ok', result, reason: caveatReason });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = String((err as Error)?.message ?? err);
          if (/SecurityError|NotAllowedError/.test(message)) {
            setFrameState({ status: 'blocked', result: null, reason: 'storage-blocked' });
          } else {
            setFrameState({ status: 'error', result: null, reason: message });
          }
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      activeFrame?.destroy();
      activeFrame = null;
    };
  }, [bundle, variant, paramsKey, mutated, staticBlockedReason, caveatReason, everVisible, retryToken]);

  const scaledHeight = Math.max(1, Math.round(bundle.viewport.height * scale));

  return (
    <div
      ref={outerRef}
      role="group"
      aria-label={bundle.variants[variant].label}
      data-testid="experiment-frame"
      data-variant={variant}
      data-status={effectiveState.status}
      className={className}
      style={{
        width: '100%',
        height: `${scaledHeight}px`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: `${bundle.viewport.width}px`,
          height: `${bundle.viewport.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
    </div>
  );
}
