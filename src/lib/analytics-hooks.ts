'use client';

import { useCallback } from 'react';
import { trackOnce } from './analytics';

/** Returns a stable callback that records a single `experiment_interact` per pageview for `labId`. */
export function useTrackLabInteraction(labId: string): () => void {
  return useCallback(() => {
    trackOnce('experiment_interact', labId);
  }, [labId]);
}
