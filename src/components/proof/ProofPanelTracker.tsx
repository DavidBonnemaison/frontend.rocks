'use client';

import { useEffect } from 'react';
import { whenActivated } from '@/lib/activation';
import { trackOnce } from '@/lib/analytics';

/**
 * Emits `proof_panel_open` once per page view when `#proof` enters the viewport
 * (IntersectionObserver threshold 0.3) or when the reader clicks `[data-testid="proof-chip"]`.
 */
export function ProofPanelTracker({ pageId }: { pageId: string }) {
  useEffect(() => {
    const emit = () => {
      whenActivated(() => trackOnce('proof_panel_open', pageId));
    };

    const chip = document.querySelector('[data-testid="proof-chip"]');
    chip?.addEventListener('click', emit);

    const panel = document.getElementById('proof');
    let observer: IntersectionObserver | null = null;
    if (panel && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.3)) {
            emit();
            observer?.disconnect();
          }
        },
        { threshold: 0.3 }
      );
      observer.observe(panel);
    }

    return () => {
      chip?.removeEventListener('click', emit);
      observer?.disconnect();
    };
  }, [pageId]);

  return null;
}
