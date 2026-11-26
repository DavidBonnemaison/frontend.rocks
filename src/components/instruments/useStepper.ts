'use client';

import { useCallback, useEffect, useReducer, type KeyboardEvent } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface StepperState {
  index: number;
  count: number;
  playing: boolean;
}

export type StepperAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'goto'; index: number }
  | { type: 'play'; reducedMotion?: boolean }
  | { type: 'pause' }
  | { type: 'tick' }
  | { type: 'reset'; count: number };

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export function stepperReducer(state: StepperState, action: StepperAction): StepperState {
  const max = Math.max(0, state.count - 1);
  switch (action.type) {
    case 'next':
      return { ...state, index: clampIndex(state.index + 1, state.count), playing: false };
    case 'prev':
      return { ...state, index: clampIndex(state.index - 1, state.count), playing: false };
    case 'home':
      return { ...state, index: 0, playing: false };
    case 'end':
      return { ...state, index: max, playing: false };
    case 'goto':
      return { ...state, index: clampIndex(action.index, state.count), playing: false };
    case 'play':
      if (action.reducedMotion || state.count <= 1) {
        return { ...state, playing: false };
      }
      return {
        ...state,
        index: state.index >= max ? 0 : state.index,
        playing: true,
      };
    case 'pause':
      return { ...state, playing: false };
    case 'tick':
      if (!state.playing || state.count <= 1) {
        return { ...state, playing: false };
      }
      if (state.index >= max) {
        return { ...state, playing: false };
      }
      return { ...state, index: state.index + 1 };
    case 'reset':
      return {
        index: clampIndex(state.index, action.count),
        count: Math.max(0, action.count),
        playing: false,
      };
  }
}

export interface UseStepperResult {
  index: number;
  count: number;
  playing: boolean;
  reducedMotion: boolean;
  next: () => void;
  prev: () => void;
  home: () => void;
  end: () => void;
  goto: (index: number) => void;
  togglePlay: () => void;
  pause: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

const AUTOPLAY_INTERVAL_MS = 600;

export function useStepper(count: number, initialIndex = 0): UseStepperResult {
  const reducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(stepperReducer, {
    index: clampIndex(initialIndex, count),
    count: Math.max(0, count),
    playing: false,
  });

  const effectiveIndex = clampIndex(state.index, count);
  const effectivePlaying = reducedMotion ? false : state.playing && count > 1;

  useEffect(() => {
    if (!effectivePlaying) return;
    const id = window.setInterval(() => {
      dispatch({ type: 'tick' });
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [effectivePlaying]);

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const prev = useCallback(() => dispatch({ type: 'prev' }), []);
  const home = useCallback(() => dispatch({ type: 'home' }), []);
  const end = useCallback(() => dispatch({ type: 'end' }), []);
  const goto = useCallback((idx: number) => dispatch({ type: 'goto', index: idx }), []);
  const pause = useCallback(() => dispatch({ type: 'pause' }), []);
  const togglePlay = useCallback(() => {
    if (effectivePlaying) {
      dispatch({ type: 'pause' });
    } else {
      dispatch({ type: 'play', reducedMotion });
    }
  }, [effectivePlaying, reducedMotion]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        dispatch({ type: 'next' });
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        dispatch({ type: 'prev' });
        break;
      case 'Home':
        e.preventDefault();
        dispatch({ type: 'home' });
        break;
      case 'End':
        e.preventDefault();
        dispatch({ type: 'end' });
        break;
      default:
        break;
    }
  }, []);

  return {
    index: effectiveIndex,
    count: Math.max(0, count),
    playing: effectivePlaying,
    reducedMotion,
    next,
    prev,
    home,
    end,
    goto,
    togglePlay,
    pause,
    onKeyDown,
  };
}
